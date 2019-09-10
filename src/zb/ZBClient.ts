import chalk from 'chalk'
import * as fs from 'fs'
import * as path from 'path'
import promiseRetry from 'promise-retry'
import { parse } from 'url'
import { v4 as uuid } from 'uuid'
import { BpmnParser, stringifyVariables } from '../lib'
import { GRPCClient } from '../lib/GRPCClient'
import * as ZB from '../lib/interfaces'
import { OAuthProvider } from '../lib/OAuthProvider'
// tslint:disable-next-line: no-duplicate-imports
import { Utils } from '../lib/utils'
import { ZBLogger } from '../lib/ZBLogger'
import { ZBWorker } from './ZBWorker'

const DEFAULT_GATEWAY_PORT = '26500'

const idColors = [
	chalk.yellow,
	chalk.green,
	chalk.cyan,
	chalk.magenta,
	chalk.blue,
]

export class ZBClient {
	public gatewayAddress: string
	private closePromise?: Promise<any>
	private closing = false
	private gRPCClient: ZB.ZBGRPC
	private options: ZB.ZBClientOptions
	private workerCount = 0
	private workers: Array<ZBWorker<any, any, any>> = []
	private retry: boolean
	private maxRetries: number = 50
	private maxRetryTimeout: number = 5000
	private loglevel: ZB.Loglevel
	private logger: ZBLogger
	private oAuth?: OAuthProvider
	private useTLS: boolean

	constructor(gatewayAddress: string, options: ZB.ZBClientOptions = {}) {
		if (!gatewayAddress) {
			throw new Error(
				'Must provide a gateway address string to constructor'
			)
		}
		this.options = options ? options : {}
		this.loglevel =
			(process.env.ZB_NODE_LOG_LEVEL as ZB.Loglevel) ||
			options.loglevel ||
			'INFO'
		this.logger = new ZBLogger({
			loglevel: this.loglevel,
			taskType: 'ZBClient',
		})
		const includesProtocol = gatewayAddress.includes('://')
		if (!includesProtocol) {
			gatewayAddress = `grpc://${gatewayAddress}`
		}
		const url = parse(gatewayAddress)
		url.port = url.port || DEFAULT_GATEWAY_PORT
		url.hostname = url.hostname || url.path

		this.gatewayAddress = `${url.hostname}:${url.port}`

		this.oAuth = options.oAuth
			? new OAuthProvider(options.oAuth)
			: undefined
		this.useTLS = options.useTLS === true || !!options.oAuth
		this.logger.info(`Use TLS: ${this.useTLS}`)

		this.gRPCClient = new GRPCClient({
			host: this.gatewayAddress,
			loglevel: this.loglevel,
			oAuth: this.oAuth,
			options: { longPoll: this.options.longPoll },
			packageName: 'gateway_protocol',
			protoPath: path.join(__dirname, '../../proto/zeebe.proto'),
			service: 'Gateway',
			useTLS: this.useTLS,
		}) as ZB.ZBGRPC

		this.retry = options.retry !== false
		this.maxRetries = options.maxRetries || this.maxRetries
		this.maxRetryTimeout = options.maxRetryTimeout || this.maxRetryTimeout
	}

	/**
	 *
	 * @param id - A unique identifier for this worker.
	 * @param taskType - The BPMN Zeebe task type that this worker services.
	 * @param taskHandler - A handler for activated jobs.
	 * @param options - Configuration options for the worker.
	 */
	public createWorker<
		WorkerInputVariables = ZB.GenericWorkerInputVariables,
		CustomHeaderShape = ZB.GenericCustomHeaderShape,
		WorkerOutputVariables = ZB.GenericWorkerOutputVariables
	>(
		id: string | null,
		taskType: string,
		taskHandler: ZB.ZBWorkerTaskHandler<
			WorkerInputVariables,
			CustomHeaderShape,
			WorkerOutputVariables
		>,
		options: ZB.ZBWorkerOptions & ZB.ZBClientOptions = {},
		onConnectionError?: ZB.ConnectionErrorHandler | undefined
	) {
		if (this.closing) {
			throw new Error('Client is closing. No worker creation allowed!')
		}
		const idColor = idColors[this.workerCount++ % idColors.length]
		// Merge parent client options with worker override
		options = { ...this.options, ...options }
		// Give worker its own gRPC connection
		const workerGRPCClient = new GRPCClient({
			host: this.gatewayAddress,
			loglevel: this.loglevel!,
			oAuth: this.oAuth,
			options: { longPoll: this.options.longPoll },
			packageName: 'gateway_protocol',
			protoPath: path.join(__dirname, '../../proto/zeebe.proto'),
			service: 'Gateway',
			useTLS: this.useTLS,
		}) as ZB.ZBGRPC
		const worker = new ZBWorker<
			WorkerInputVariables,
			CustomHeaderShape,
			WorkerOutputVariables
		>({
			gRPCClient: workerGRPCClient,
			id,
			idColor,
			onConnectionError,
			options: { ...this.options, ...options },
			taskHandler,
			taskType,
			zbClient: this,
		})
		this.workers.push(worker)
		return worker
	}

	/**
	 * Gracefully shut down all workers, draining existing tasks, and return when it is safe to exit.
	 * @returns Promise
	 * @memberof ZBClient
	 */
	public async close() {
		if (this.closePromise) {
			return this.closePromise
		}
		// Prevent the creation of more workers
		this.closing = true
		await Promise.all(this.workers.map(w => w.close()))
		this.gRPCClient.close() // close the GRPC channel
	}

	/**
	 * Return the broker cluster topology
	 */
	public topology(): Promise<ZB.TopologyResponse> {
		return this.executeOperation(this.gRPCClient.topologySync)
	}

	/**
	 *
	 * @param workflow - A path or array of paths to .bpmn files.
	 * @param {redeploy?: boolean} - Redeploy workflow. Defaults to true.
	 * If set false, will not redeploy a workflow that exists.
	 */
	public async deployWorkflow(
		workflow: string | string[]
	): Promise<ZB.DeployWorkflowResponse> {
		const workflows = Array.isArray(workflow) ? workflow : [workflow]

		const readFile = (filename: string) => {
			if (fs.existsSync(filename)) {
				return fs.readFileSync(filename)
			}
			const name = `${filename}.bpmn`
			if (fs.existsSync(name)) {
				return fs.readFileSync(name)
			}
			throw new Error(`${filename} not found.`)
		}

		const workFlowRequests: ZB.WorkflowRequestObject[] = workflows.map(
			wf => ({
				definition: readFile(wf),
				name: path.basename(wf),
				type: 1,
			})
		)

		if (workFlowRequests.length > 0) {
			return this.executeOperation(() =>
				this.gRPCClient.deployWorkflowSync({
					workflows: workFlowRequests,
				})
			)
		} else {
			return {
				key: '-1',
				workflows: [],
			}
		}
	}

	/**
	 * Return an array of task-types specified in a BPMN file.
	 * @param file - Path to bpmn file.
	 */
	public getServiceTypesFromBpmn(files: string | string[]) {
		if (typeof files === 'string') {
			files = [files]
		}
		return BpmnParser.getTaskTypes(BpmnParser.parseBpmn(files))
	}

	/**
	 * Publish a message to the broker for correlation with a workflow instance.
	 * @param publishMessageRequest - The message to publish.
	 */
	public publishMessage<T = ZB.GenericWorkflowVariables>(
		publishMessageRequest: ZB.PublishMessageRequest<T>
	): Promise<void> {
		return this.executeOperation(() =>
			this.gRPCClient.publishMessageSync(
				stringifyVariables(publishMessageRequest)
			)
		)
	}

	/**
	 * Publish a message to the broker for correlation with a workflow message start event.
	 * @param publishStartMessageRequest - The message to publish.
	 */
	public publishStartMessage<T = ZB.GenericWorkflowVariables>(
		publishStartMessageRequest: ZB.PublishStartMessageRequest<T>
	): Promise<void> {
		/**
		 * The hash of the correlationKey is used to determine the partition where this workflow will start.
		 * So we assign a random uuid to balance workflow instances created via start message across partitions.
		 *
		 * We make the correlationKey optional, because the caller can specify a correlationKey + messageId
		 * to guarantee an idempotent message.
		 *
		 * Multiple messages with the same correlationKey + messageId combination will only start a workflow once.
		 * See: https://github.com/zeebe-io/zeebe/issues/1012 and https://github.com/zeebe-io/zeebe/issues/1022
		 */

		const publishMessageRequest: ZB.PublishMessageRequest = {
			correlationKey: uuid(),
			...publishStartMessageRequest,
		}
		return this.executeOperation(() =>
			this.gRPCClient.publishMessageSync(
				stringifyVariables(publishMessageRequest)
			)
		)
	}

	public updateJobRetries(
		updateJobRetriesRequest: ZB.UpdateJobRetriesRequest
	): Promise<void> {
		return this.executeOperation(() =>
			this.gRPCClient.updateJobRetriesSync(updateJobRetriesRequest)
		)
	}

	public failJob(failJobRequest: ZB.FailJobRequest): Promise<void> {
		return this.executeOperation(() =>
			this.gRPCClient.failJobSync(failJobRequest)
		)
	}

	/**
	 *
	 * Create and start execution of a workflow instance.
	 * @param {string} bpmnProcessId
	 * @param {Variables} variables - payload to pass in to the workflow
	 * @param {number} [version] - version of the workflow to run. Optional: defaults to latest if not present
	 * @returns {Promise<CreateWorkflowInstanceResponse>}
	 * @memberof ZBClient
	 */
	public createWorkflowInstance<Variables = ZB.GenericWorkflowVariables>(
		bpmnProcessId: string,
		variables: Variables,
		options: ZB.OperationOptions = {
			maxRetries: this.maxRetries,
			retry: true,
		}
	): Promise<ZB.CreateWorkflowInstanceResponse> {
		const version = options.version || -1

		const createWorkflowInstanceRequest: ZB.CreateWorkflowInstanceRequest = {
			bpmnProcessId,
			variables: (variables as unknown) as object,
			version,
		}

		return options.retry === false
			? this.executeOperation(() =>
					this.gRPCClient.createWorkflowInstanceSync(
						stringifyVariables(createWorkflowInstanceRequest)
					)
			  )
			: this.gRPCClient.createWorkflowInstanceSync(
					stringifyVariables(createWorkflowInstanceRequest)
			  )
	}

	public async cancelWorkflowInstance(
		workflowInstanceKey: string | number
	): Promise<void> {
		Utils.validateNumber(workflowInstanceKey, 'workflowInstanceKey')
		return this.executeOperation(() =>
			this.gRPCClient.cancelWorkflowInstanceSync({
				workflowInstanceKey,
			})
		)
	}

	public setVariables<Variables = ZB.GenericWorkflowVariables>(
		request: ZB.SetVariablesRequest<Variables>
	): Promise<void> {
		/*
		We allow developers to interact with variables as a native JS object, but the Zeebe server needs it as a JSON document
		So we stringify it here.
		*/
		if (typeof request.variables === 'object') {
			request.variables = JSON.stringify(request.variables) as any
		}
		return this.executeOperation(() =>
			this.gRPCClient.setVariablesSync(request)
		)
	}

	public resolveIncident(incidentKey: string): Promise<void> {
		return this.executeOperation(() =>
			this.gRPCClient.resolveIncidentSync(incidentKey)
		)
	}

	/**
	 * If this.retry is set true, the operation will be wrapped in an configurable retry on exceptions
	 * of gRPC error code 14 - Transient Network Failure.
	 * See: https://github.com/grpc/grpc/blob/master/doc/statuscodes.md
	 * If this.retry is false, it will be executed with no retry, and the application should handle the exception.
	 * @param operation A gRPC command operation
	 */
	private async executeOperation<T>(
		operation: () => Promise<T>,
		retries?: number
	): Promise<T> {
		return this.retry
			? this.retryOnFailure(operation, retries)
			: operation()
	}

	/**
	 * This function takes a gRPC operation that returns a Promise as a function, and invokes it.
	 * If the operation throws gRPC error 14, this function will continue to try it until it succeeds
	 * or retries are exhausted.
	 * @param operation A gRPC command operation that may fail if the broker is not available
	 */
	private async retryOnFailure<T>(
		operation: () => Promise<T>,
		retries = this.maxRetries
	): Promise<T> {
		const c = console
		return promiseRetry(
			(retry, n) => {
				if (this.closing) {
					return Promise.resolve() as any
				}
				if (n > 1) {
					c.error(
						`gRPC connection is in failed state. Attempt ${n}. Retrying in 5s...`
					)
				}
				return operation().catch(err => {
					// This could be DNS resolution, or the gRPC gateway is not reachable yet
					const isNetworkError =
						err.message.indexOf('14') === 0 ||
						err.message.indexOf('Stream removed') !== -1
					if (isNetworkError) {
						c.error(`${err.message}`)
						retry(err)
					}
					throw err
				})
			},
			{
				maxTimeout: this.maxRetryTimeout,
				retries,
			}
		)
	}
}
