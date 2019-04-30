import { Chalk } from 'chalk'
import { ZBWorker } from '../zb/ZBWorker'

export interface KeyedObject {
	[key: string]: any
}
export type Loglevel = 'INFO' | 'DEBUG' | 'NONE' | 'ERROR'

export type completeFn<WorkerOutputVariables> = (
	updatedVariables?: Partial<WorkerOutputVariables>
) => void

export type ZBWorkerTaskHandler<
	WorkerInputVariables = KeyedObject,
	CustomHeaderShape = KeyedObject,
	WorkerOutputVariables = WorkerInputVariables
> = (
	job: Job<WorkerInputVariables, CustomHeaderShape>,
	complete: completeFn<WorkerOutputVariables>,
	worker: ZBWorker<
		WorkerInputVariables,
		CustomHeaderShape,
		WorkerOutputVariables
	>
) => void

export interface ZBWorkerLoggerOptions {
	loglevel: Loglevel
	stdout?: any
	color?: Chalk
	namespace?: string | string[]
}

export type ConnectionErrorHandler = (error: any) => void

export interface ActivateJobsResponse {
	jobs: ActivatedJob[]
}

/**
 * Request object to send the broker to request jobs for the worker.
 */
export interface ActivateJobsRequest {
	type: string
	worker: string
	timeout: number
	amount: number
	fetchVariable?: string[]
}

export interface ActivatedJob {
	key: string
	type: string
	jobHeaders: JobHeaders
	/**
	 * JSON object as a string
	 */
	customHeaders: string
	worker: string
	retries: number
	/**
	 * epoch milliseconds
	 */
	deadline: string
	/**
	 * JSON object as a string
	 */
	payload: string
}

export interface Job<
	VariableShape = KeyedObject,
	CustomHeaderShape = KeyedObject
> {
	key: string
	type: string
	jobHeaders: JobHeaders
	customHeaders: CustomHeaderShape
	worker: string
	retries: number
	// epoch milliseconds
	deadline: string
	variables: VariableShape
}

export interface JobHeaders {
	workflowInstanceKey: string
	bpmnProcessId: string
	workflowDefinitionVersion: number
	workflowKey: string
	elementId: string
	elementInstanceKey: string
}

export interface ZBWorkerOptions {
	/**
	 * Max concurrent tasks for this worker. Default 32.
	 */
	maxActiveJobs?: number
	/**
	 * Max ms to allow before time out of a task given to this worker. Default: 1000ms.
	 */
	timeout?: number
	/**
	 * Poll Interval in ms. Default 100.
	 */
	pollInterval?: number
	/**
	 * Constrain payload to these keys only.
	 */
	fetchVariables?: string[]
	/**
	 * This handler is called when the worker cannot connect to the broker, or loses its connection.
	 */
	onConnectionErrorHandler?: ConnectionErrorHandler
	/**
	 * If a handler throws an unhandled exception, if this is set true, the workflow will be failed. Defaults to false.
	 */
	failWorkflowOnException?: boolean
}

export interface CreateWorkflowInstanceRequest<VariableShape = KeyedObject> {
	bpmnProcessId: string
	version?: number
	variables: VariableShape
}

export interface CreateWorkflowInstanceResponse {
	workflowKey: string
	bpmnProcessId: string
	version: number
	workflowInstanceKey: string
}

export enum PartitionBrokerRole {
	LEADER = 0,
	BROKER = 1,
}

export interface Partition {
	partitionId: number
	role: PartitionBrokerRole
}

export interface BrokerInfo {
	nodeId: number
	host: string
	port: number
	partitions: Partition[]
}

export interface TopologyResponse {
	brokers: BrokerInfo[]
	clusterSize: number
	partitionsCount: number
	replicationFactor: number
}

export enum ResourceType {
	// FILE type means the gateway will try to detect the resource type using the file extension of the name
	FILE = 0,
	BPMN = 1,
	YAML = 2,
}

export interface WorkflowRequestObject {
	name?: string
	type?: ResourceType
	definition: Buffer // bytes, actually
}

export interface WorkflowMetadata {
	bpmnProcessId: string
	version: number
	workflowKey: string
	resourceName: string
}

export interface DeployWorkflowResponse {
	key: number
	workflows: WorkflowMetadata[]
}

export interface DeployWorkflowRequest {
	workflows: WorkflowRequestObject[]
}

export interface ListWorkflowResponse {
	workflows: WorkflowMetadata[]
}

export interface PublishMessageRequest<V = KeyedObject> {
	/** Should match the "Message Name" in a BPMN Message Catch  */
	name: string
	/** The value to match with the field specified as "Subscription Correlation Key" in BPMN */
	correlationKey: string
	timeToLive: number
	/** Unique ID for this message */
	messageId?: string
	variables: V
}

export interface PublishStartMessageRequest<V = KeyedObject> {
	/** Should match the "Message Name" in a BPMN Message Catch  */
	name: string
	timeToLive: number
	/** Unique ID for this message */
	messageId?: string
	variables: V
}

export interface UpdateJobRetriesRequest {
	jobKey: string
	retries: number
}

export interface FailJobRequest {
	jobKey: string
	retries: number
	errorMessage: string
}

export interface CompleteJobRequest<V = KeyedObject> {
	jobKey: string
	variables: V
}

export interface SetVariablesRequest<V = KeyedObject> {
	/** the unique identifier of a particular element; can be the workflow instance key (as
	 * obtained during instance creation), or a given element, such as a service task (see
	 *  elementInstanceKey on the JobHeaders message)
	 */
	elementInstanceKey: string
	variables: V
	local: boolean
}

/* either workflow key or bpmn process id and version has to be specified*/
export type GetWorkflowRequest =
	| GetWorkflowRequestWithBpmnProcessId
	| GetWorkflowRequestWithWorkflowKey

export interface GetWorkflowRequestWithWorkflowKey {
	workflowKey: string
}

export interface GetWorkflowRequestWithBpmnProcessId {
	/** by default set version = -1 to indicate to use the latest version */
	version?: number
	bpmnProcessId: string
}

export interface GetWorkflowResponse {
	workflowKey: string
	version: number
	bpmnProcessId: string
	resourceName: string
	bpmnXml: string
}

export interface ZBClientOptions {
	loglevel?: Loglevel
	stdout?: any
}
