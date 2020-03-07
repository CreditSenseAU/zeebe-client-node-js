import { Duration } from 'typed-duration'
import { ZBClient } from '../..'

process.env.ZEEBE_NODE_LOG_LEVEL = process.env.ZEEBE_NODE_LOG_LEVEL || 'NONE'

describe('ZBClient.throwError', () => {
	let zbc: ZBClient

	beforeEach(async () => {
		zbc = new ZBClient()
	})

	afterEach(async () => {
		await zbc.close() // Makes sure we don't forget to close connection
	})

	it('Throws a business error that is caught in the process', async () => {
		await zbc.deployWorkflow(
			'./src/__tests__/testdata/Client-ThrowError.bpmn'
		)
		const processId = 'throw-bpmn-error'
		zbc.createWorker({
			taskHandler: (_, complete) =>
				complete.error('BUSINESS_ERROR', "Well, that didn't work"),
			taskType: 'throw-bpmn-error',
			timeout: Duration.seconds.of(30),
		})
		zbc.createWorker('sad-flow', (_, complete) =>
			complete.success({
				bpmnErrorCaught: true,
			})
		)
		const result = await zbc.createWorkflowInstanceWithResult(processId, {})
		expect(result.variables.bpmnErrorCaught).toBe(true)
	})
})
