import { ZBClient } from '../..'

process.env.ZB_NODE_LOG_LEVEL = process.env.ZB_NODE_LOG_LEVEL || 'NONE'

describe('ZBWorker', () => {
	let zbc: ZBClient
	let wf

	beforeEach(async () => {
		zbc = new ZBClient('0.0.0.0:26500')
	})

	afterEach(async () => {
		try {
			await zbc.cancelWorkflowInstance(wf.workflowInstanceKey)
		} finally {
			await zbc.close() // Makes sure we don't forget to close connection
		}
	})

	it('Can service a task', async done => {
		const res = await zbc.deployWorkflow(
			'./src/__tests__/testdata/hello-world.bpmn'
		)
		expect(res.workflows.length).toBe(1)

		wf = await zbc.createWorkflowInstance('hello-world', {})
		zbc.createWorker('test', 'console-log', async (job, complete) => {
			expect(job.workflowInstanceKey).toBe(wf.workflowInstanceKey)
			complete(job.variables)
			done()
		})
	})

	it('Can service a task with complete.success', async done => {
		const res = await zbc.deployWorkflow(
			'./src/__tests__/testdata/hello-world.bpmn'
		)
		expect(res.workflows.length).toBe(1)
		wf = await zbc.createWorkflowInstance('hello-world', {})
		zbc.createWorker('test', 'console-log', async (job, complete) => {
			expect(job.workflowInstanceKey).toBe(wf.workflowInstanceKey)
			complete.success(job.variables)
			done()
		})
	})

	it('Can update workflow variables with complete.success()', async done => {
		const res = await zbc.deployWorkflow(
			'./src/__tests__/testdata/conditional-pathway.bpmn'
		)
		expect(res.workflows.length).toBe(1)
		expect(res.workflows[0].bpmnProcessId).toBe('condition-test')

		wf = await zbc.createWorkflowInstance('condition-test', {
			conditionVariable: true,
		})
		const wfi = wf.workflowInstanceKey
		expect(wfi).toBeTruthy()

		await zbc.setVariables({
			elementInstanceKey: wfi,
			local: false,
			variables: {
				conditionVariable: false,
			},
		})

		zbc.createWorker('test2', 'wait', async (job, complete) => {
			expect(job.workflowInstanceKey).toBe(wfi)
			complete.success(job)
		})

		zbc.createWorker('test2', 'pathB', async (job, complete) => {
			expect(job.workflowInstanceKey).toBe(wfi)
			expect(job.variables.conditionVariable).toBe(false)
			complete.success(job.variables)
			done()
		})
	})
})
