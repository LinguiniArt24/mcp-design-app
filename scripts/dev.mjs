import { execFileSync, spawn } from 'node:child_process'
import { setTimeout as delay } from 'node:timers/promises'

// Vite moves to the next port when 5173 is taken, so earlier dev servers can
// be sitting anywhere in this range.
const PORT_START = 5173
const PORT_END = 5190
const projectDir = process.cwd()

const previous = devServerPids()
for (const pid of previous) {
	try {
		process.kill(pid, 'SIGTERM')
		console.log(`Stopped the previous dev server (pid ${pid}).`)
	} catch {
		// It exited between the lookup and the signal.
	}
}

const deadline = Date.now() + 3000
while (previous.some(isAlive) && Date.now() < deadline) {
	await delay(100)
}
for (const pid of previous) {
	if (!isAlive(pid)) continue
	try {
		process.kill(pid, 'SIGKILL')
	} catch {
		// Already gone.
	}
}

const child = spawn('vite', ['--host'], { stdio: 'inherit' })

for (const signal of ['SIGINT', 'SIGTERM']) {
	process.on(signal, () => {
		child.kill(signal)
	})
}

child.on('exit', (code, signal) => {
	if (signal) {
		process.kill(process.pid, signal)
		return
	}
	process.exit(code ?? 0)
})

/**
 * Dev servers previously started for this project: a Vite process whose
 * working directory is this folder and which is listening in the dev port range.
 */
function devServerPids() {
	let output
	try {
		output = execFileSync(
			'lsof',
			['-nP', `-iTCP:${PORT_START}-${PORT_END}`, '-sTCP:LISTEN', '-Fp'],
			{ encoding: 'utf8' }
		)
	} catch {
		return []
	}

	const pids = [
		...new Set(
			output
				.split('\n')
				.filter((line) => line.startsWith('p'))
				.map((line) => Number(line.slice(1)))
		),
	]

	return pids.filter((pid) => pid !== process.pid && cwdOf(pid) === projectDir && isVite(pid))
}

function cwdOf(pid) {
	try {
		const output = execFileSync('lsof', ['-a', '-p', String(pid), '-d', 'cwd', '-Fn'], {
			encoding: 'utf8',
		})
		const line = output.split('\n').find((entry) => entry.startsWith('n'))
		return line ? line.slice(1) : ''
	} catch {
		return ''
	}
}

function isVite(pid) {
	try {
		const command = execFileSync('ps', ['-p', String(pid), '-o', 'command='], { encoding: 'utf8' })
		return command.includes('vite')
	} catch {
		return false
	}
}

function isAlive(pid) {
	try {
		process.kill(pid, 0)
		return true
	} catch {
		return false
	}
}
