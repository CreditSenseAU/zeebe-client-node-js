import chalk from 'chalk'
import { ZBLogger } from '..'
import { GrpcClient, GrpcClientCtor, MiddlewareSignals } from './GrpcClient'

export type GrpcConnectionProfile = 'CAMUNDA_CLOUD' | 'VANILLA'
type Characteristics = any
const ConnectionCharacteristics: {
	[key in GrpcConnectionProfile]: Characteristics
} = {
	CAMUNDA_CLOUD: {
		startupTime: 3000,
	},
	VANILLA: {},
}

export class GrpcMiddleware {
	private grpcClient: GrpcClient
	private characteristics: Characteristics
	private log: ZBLogger
	constructor({
		profile,
		config,
	}: {
		profile: GrpcConnectionProfile
		config: GrpcClientCtor
	}) {
		this.characteristics = ConnectionCharacteristics[profile]

		this.log = new ZBLogger({
			color: chalk.green,
			id: 'gRPC Channel',
			loglevel: config.loglevel,
			namespace: config.namespace,
			pollInterval: config.options.longPoll!,
			stdout: config.stdout,
			taskType: config.tasktype,
		})

		this.grpcClient = this.createInterceptedGrpcClient(config)
	}
	public getGrpcClient = () => this.grpcClient

	private createInterceptedGrpcClient(config: GrpcClientCtor) {
		const grpcClient = new GrpcClient(config)
		grpcClient.on(MiddlewareSignals.Log.Debug, this.debug)
		grpcClient.on(MiddlewareSignals.Log.Info, this.info)
		grpcClient.on(MiddlewareSignals.Log.Error, this.error)
		grpcClient.on(MiddlewareSignals.Event.Error, this.emitError)
		grpcClient.on(MiddlewareSignals.Event.Ready, this.emitReady)
		return grpcClient
	}
	private info = (msg: any) => this.characteristics && this.log.info(msg)
	private debug = (msg: any) => this.log.debug(msg)
	private error = (msg: any) => this.log.error(msg)
	private emitError = () => this.grpcClient.emit('connectionError')
	private emitReady = () => this.grpcClient.emit('ready')
}
