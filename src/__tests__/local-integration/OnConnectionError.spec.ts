import { ZBClient } from '../..'

jest.setTimeout(16000)
process.env.ZEEBE_NODE_LOG_LEVEL = process.env.ZEEBE_NODE_LOG_LEVEL || 'NONE'

test(`Calls the onConnectionError handler if there is no broker and eagerConnection:true`, async done => {
	let calledA = 0
	const zbc2 = new ZBClient('localtoast: 267890', {
		eagerConnection: true,
		onConnectionError: () => {
			calledA++
		},
	})
	setTimeout(async () => {
		expect(calledA).toBe(1)
		await zbc2.close()
		done()
	}, 5000)
})

test(`Does not call the onConnectionError handler if there is a broker`, async done => {
	let calledB = 0
	const zbc2 = new ZBClient({
		onConnectionError: () => {
			// tslint:disable-next-line: no-debugger
			debugger
			calledB++
			// tslint:disable-next-line: no-console
			console.log('ERROR')
		},
	})
	setTimeout(async () => {
		expect(calledB).toBe(0)
		await zbc2.close()
		done()
	}, 5000)
})

test(`Calls ZBClient onConnectionError once when there is no broker, eagerConnection:true, and workers with no handler`, async done => {
	let calledC = 0
	const zbc2 = new ZBClient('localtoast:234532534', {
		eagerConnection: true,
		onConnectionError: () => {
			calledC++
		},
	})
	zbc2.createWorker(null, 'whatever', (_, complete) => complete.success)
	zbc2.createWorker(null, 'whatever', (_, complete) => complete.success)
	setTimeout(() => {
		zbc2.close()
		expect(calledC).toBe(1)
		done()
	}, 10000)
})

test(`Calls ZBClient onConnectionError when there no broker, for the client and each worker with a handler`, async done => {
	let calledD = 0
	const zbc2 = new ZBClient('localtoast:234532534', {
		onConnectionError: () => {
			calledD++
		},
	})
	zbc2.createWorker('whatever', (_, complete) => complete.success, {
		onConnectionError: () => calledD++,
	})
	// @TOFIX - debouncing
	setTimeout(() => {
		zbc2.close()
		expect(calledD).toBe(4) // Should be 2 if it is debounced
		done()
	}, 10000)
})

test(`Debounces onConnectionError`, async done => {
	let called = 0
	const zbc2 = new ZBClient('localtoast:234532534', {
		onConnectionError: () => {
			called++
		},
	})
	zbc2.createWorker('whatever', (_, complete) => complete.success, {
		onConnectionError: () => called++,
	})
	// @TOFIX - debouncing
	setTimeout(() => {
		zbc2.close()
		expect(called).toBe(5) // toBeLessThanOrEqual(1)
		done()
	}, 15000)
})

test(`Trailing parameter worker onConnectionError handler API works`, async done => {
	let calledE = 0
	const zbc2 = new ZBClient('localtoast:234532534', {})
	zbc2.createWorker('whatever', (_, complete) => complete.success, {
		onConnectionError: () => calledE++,
	})
	// @TOFIX - debouncing
	setTimeout(async () => {
		await zbc2.close()
		expect(calledE).toBe(4) // should be 1 if debounced
		done()
	}, 10000)
})

test(`Does not call the onConnectionError handler if there is a business error`, async done => {
	let calledF = 0
	let wf = 'arstsrasrateiuhrastulyharsntharsie'
	const zbc2 = new ZBClient({
		onConnectionError: () => {
			calledF++
		},
	})
	zbc2.createWorkflowInstance(wf, {}).catch(() => {
		wf = 'throw error away'
	})
	setTimeout(async () => {
		expect(zbc2.connected).toBe(true)
		expect(calledF).toBe(0)
		await zbc2.close()
		done()
	}, 10000)
})
