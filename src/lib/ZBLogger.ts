import { Chalk } from 'chalk'
import dayjs from 'dayjs'
import * as stackTrace from 'stack-trace'
import { Loglevel, ZBWorkerLoggerOptions } from './interfaces'

export class ZBLogger {
	public loglevel: Loglevel
	private colorFn: Chalk
	private taskType: string
	private id?: string
	private stdout: any
	private colorise: boolean
	private pollMode: string

	constructor({
		loglevel,
		color,
		id,
		namespace,
		stdout,
		taskType,
		colorise,
		pollMode,
	}: ZBWorkerLoggerOptions & {
		id?: string
		colorise?: boolean
	}) {
		this.colorFn = color || ((m => m) as any)
		this.taskType = taskType
		this.id = id
		if (Array.isArray(namespace)) {
			namespace = namespace.join(' ')
		}
		this.loglevel = loglevel
		this.stdout = stdout || console
		this.colorise = colorise !== false
		this.pollMode = pollMode || ''
	}

	public info(message: any, ...optionalParameters) {
		if (this.loglevel === 'NONE' || this.loglevel === 'ERROR') {
			return
		}
		const frame = stackTrace.get()[1]
		const msg =
			optionalParameters.length > 0
				? this.makeMessage(frame, 30, message, optionalParameters)
				: this.makeMessage(frame, 30, message)
		if (this.stdout === console) {
			this.stdout.info(msg)
		} else {
			this.stdout.info(msg)
		}
	}

	public error(message, ...optionalParameters: any[]) {
		if (this.loglevel === 'NONE') {
			return
		}
		const frame = stackTrace.get()[1]

		const msg =
			optionalParameters.length > 0
				? this.makeMessage(frame, 50, message, optionalParameters)
				: this.makeMessage(frame, 50, message)
		this.stdout.info(msg)
	}

	public debug(message: any, ...optionalParameters: any[]) {
		if (this.loglevel !== 'DEBUG') {
			return
		}
		const frame = stackTrace.get()[1]

		const msg =
			optionalParameters.length > 0
				? this.makeMessage(frame, 20, message, optionalParameters)
				: this.makeMessage(frame, 20, message)
		if (this.stdout === console) {
			this.stdout.info(this._colorise(msg))
		} else {
			this.stdout.info(msg)
		}
	}

	public log(message: any, ...optionalParameters: any[]) {
		if (this.loglevel === 'NONE' || this.loglevel === 'ERROR') {
			return
		}
		const frame = stackTrace.get()[1]

		const msg =
			optionalParameters.length > 0
				? this.makeMessage(frame, 30, message, optionalParameters)
				: this.makeMessage(frame, 30, message)
		if (this.stdout === console) {
			this.stdout.info(msg)
		} else {
			this.stdout.info(msg)
		}
	}

	private makeMessage(
		frame: stackTrace.StackFrame,
		level: number,
		message,
		...optionalParameters
	) {
		const msg = {
			context: `${frame.getFileName()}:${frame.getLineNumber()}`,
			id: this.id,
			level,
			message,
			pollMode: this.pollMode,
			taskType: this.taskType,
			time: dayjs().format('YYYY MMM-DD HH:mm:ssA'),
			timestamp: new Date(),
		}

		if (optionalParameters.length > 0) {
			;(msg as any).data = optionalParameters
		}
		return JSON.stringify(msg)
	}

	private _colorise(message: string) {
		if (this.stdout === console && this.colorise) {
			// Only colorise console
			if (this.colorFn && typeof this.colorFn === 'function') {
				return this.colorFn(message)
			} else {
				return message
			}
		}
		return message
	}
}
