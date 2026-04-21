import { Enums, type Atem, type DisplayClock } from 'atem-connection'
import type { CompanionActionDefinitions } from '@companion-module/base'
import { convertOptionsFields } from '../options/util.js'
import {
	AtemDisplayClockPropertiesPickers,
	AtemDisplayClockTimeOffsetPickers,
	AtemDisplayClockTimePickers,
} from '../options/displayClock.js'
import type { ModelSpec } from '../models/index.js'
import type { StateWrapper } from '../state.js'

export type AtemDisplayClockActions = {
	['displayClockState']: {
		options: {
			state: 'toggle' | Enums.DisplayClockClockState
		}
	}
	['displayClockConfigure']: {
		options: {
			properties: Array<'enabled' | 'size' | 'opacity' | 'x' | 'y' | 'autoHide' | 'clockMode'>

			enabled: boolean
			size: number
			opacity: number
			x: number
			y: number
			autoHide: boolean
			clockMode: Enums.DisplayClockClockMode
		}
	}
	['displayClockStartTime']: {
		options: {
			useCombinedVariable: boolean
			combinedVar: string
			hours: number
			minutes: number
			seconds: number
		}
	}
	['displayClockOffsetStartTime']: {
		options: {
			useCombinedVariable: boolean
			combinedVar: string
			hours: number
			minutes: number
			seconds: number
		}
	}
}

function clamp(min: number, max: number, value: number): number {
	return Math.min(max, Math.max(min, Math.floor(value)))
}

async function parseNumberField(options: any, field: string, label: string): Promise<number> {
	const num = await options.getParsedNumber(field)
	if (isNaN(num)) {
		throw new Error(`Invalid numeric value for ${label}: ${num}`)
	}
	return num
}

async function parseStringField(options: any, field: string): Promise<string> {
	if (typeof options.getParsedString === 'function') {
		return String(await options.getParsedString(field))
	}

	const raw = typeof options.getRaw === 'function' ? options.getRaw(field) : options[field]
	return raw === undefined || raw === null ? '' : String(raw)
}

function parseCombinedStartTime(value: string): Pick<DisplayClock.DisplayClockTime, 'hours' | 'minutes' | 'seconds'> {
	const match = value.trim().match(/^(\d+):(\d+):(\d+)$/)
	if (!match) {
		throw new Error(`Invalid time '${value}'. Expected HH:MM:SS`)
	}

	return {
		hours: clamp(0, 23, Number(match[1])),
		minutes: clamp(0, 59, Number(match[2])),
		seconds: clamp(0, 59, Number(match[3])),
	}
}

function parseCombinedOffsetSeconds(value: string): number {
	const trimmed = value.trim()

	const signedMatch = trimmed.match(/^([+-])?(\d+):(\d+):(\d+)$/)
	if (signedMatch) {
		const sign = signedMatch[1] === '-' ? -1 : 1
		const hours = clamp(0, 23, Number(signedMatch[2]))
		const minutes = clamp(0, 59, Number(signedMatch[3]))
		const seconds = clamp(0, 59, Number(signedMatch[4]))
		return sign * (hours * 3600 + minutes * 60 + seconds)
	}

	const parts = trimmed.split(':').map((part) => Number(part.trim()))
	if (parts.length !== 3 || parts.some((part) => isNaN(part))) {
		throw new Error(`Invalid offset '${value}'. Expected +/-HH:MM:SS`)
	}

	return clamp(-23, 23, parts[0]) * 3600 + clamp(-59, 59, parts[1]) * 60 + clamp(-59, 59, parts[2])
}

async function getTimeValue(options: any, field: 'hours' | 'minutes' | 'seconds'): Promise<number> {
	const raw = options.getRaw(field)
	if (typeof raw === 'number') return raw
	if (raw !== undefined && raw !== null && raw !== '') return parseNumberField(options, field, field)

	return 0
}

export function createDisplayClockActions(
	atem: Atem | undefined,
	model: ModelSpec,
	state: StateWrapper,
): CompanionActionDefinitions<AtemDisplayClockActions> {
	if (!model.displayClock) {
		return {
			['displayClockState']: undefined,
			['displayClockConfigure']: undefined,
			['displayClockStartTime']: undefined,
			['displayClockOffsetStartTime']: undefined,
		}
	}
	return {
		['displayClockState']: {
			name: 'Display Clock: Start/Stop',
			options: convertOptionsFields({
				state: {
					id: 'state',
					label: 'State',
					type: 'dropdown',
					default: 'toggle',
					choices: [
						{ id: 'toggle', label: 'Toggle' },
						{ id: Enums.DisplayClockClockState.Running, label: 'Start' },
						{ id: Enums.DisplayClockClockState.Stopped, label: 'Stop' },
						{ id: Enums.DisplayClockClockState.Reset, label: 'Reset' },
					],
					disableAutoExpression: true,
				},
			}),
			callback: async ({ options }) => {
				let newState: Enums.DisplayClockClockState | undefined
				const rawState = options.state
				switch (rawState) {
					case 'toggle':
						newState =
							state.state.displayClock?.properties?.clockState === Enums.DisplayClockClockState.Running
								? Enums.DisplayClockClockState.Stopped
								: Enums.DisplayClockClockState.Running
						break
					case Enums.DisplayClockClockState.Running:
					case Enums.DisplayClockClockState.Stopped:
					case Enums.DisplayClockClockState.Reset:
						newState = rawState
						break
				}

				if (newState !== undefined) {
					await atem?.setDisplayClockState(newState)
				}
			},
		},
		['displayClockConfigure']: {
			name: 'Display Clock: Configure',
			options: convertOptionsFields({
				...AtemDisplayClockPropertiesPickers(),
			}),
			callback: async ({ options }) => {
				const newProps: Partial<DisplayClock.DisplayClockProperties> = {}

				const props = options.properties
				if (props && Array.isArray(props)) {
					if (props.includes('enabled')) newProps.enabled = options.enabled

					if (props.includes('size')) newProps.size = options.size * 100
					if (props.includes('opacity')) newProps.opacity = options.opacity * 100
					if (props.includes('x')) newProps.positionX = options.x * 1000
					if (props.includes('y')) newProps.positionY = options.y * 1000

					if (props.includes('autoHide')) newProps.autoHide = options.autoHide

					if (props.includes('clockMode')) newProps.clockMode = options.clockMode
				}

				if (Object.keys(newProps).length === 0) return

				await atem?.setDisplayClockProperties(newProps)
			},
			learn: () => {
				const displayClockConfig = state.state.displayClock?.properties
				if (displayClockConfig) {
					return {
						enabled: displayClockConfig.enabled,
						size: displayClockConfig.size / 100,
						opacity: displayClockConfig.opacity / 100,
						x: displayClockConfig.positionX / 1000,
						y: displayClockConfig.positionY / 1000,
						autoHide: displayClockConfig.autoHide,
						clockMode: displayClockConfig.clockMode,
					}
				}
				return undefined
			},
		},
		['displayClockStartTime']: {
			name: 'Display Clock: Set Start Time',
			options: convertOptionsFields({ ...AtemDisplayClockTimePickers() }),
			callback: async ({ options }) => {
				let hours: number
				let minutes: number
				let seconds: number

				if (options.useCombinedVariable === true) {
					const combined = parseCombinedStartTime(await parseStringField(options, 'combinedVar'))
					hours = combined.hours
					minutes = combined.minutes
					seconds = combined.seconds
				} else {
					hours = clamp(0, 23, await getTimeValue(options, 'hours'))
					minutes = clamp(0, 59, await getTimeValue(options, 'minutes'))
					seconds = clamp(0, 59, await getTimeValue(options, 'seconds'))
				}

				const time: DisplayClock.DisplayClockTime = {
					hours,
					minutes,
					seconds,
					frames: 0,
				}

				await atem?.setDisplayClockProperties({
					startFrom: time,
				})
			},
			learn: () => {
				const displayClockConfig = state.state.displayClock?.properties
				if (displayClockConfig) {
					return {
						hours: displayClockConfig.startFrom.hours,
						minutes: displayClockConfig.startFrom.minutes,
						seconds: displayClockConfig.startFrom.seconds,
					}
				}
				return undefined
			},
		},
		['displayClockOffsetStartTime']: {
			name: 'Display Clock: Offset Start Time',
			options: convertOptionsFields({ ...AtemDisplayClockTimeOffsetPickers() }),
			callback: async ({ options }) => {
				const clockState = state.state.displayClock?.properties?.startFrom
				const currentTime = clockState ? clockState.hours * 3600 + clockState.minutes * 60 + clockState.seconds : 0

				const offset =
					options.useCombinedVariable === true
						? parseCombinedOffsetSeconds(await parseStringField(options, 'combinedVar'))
						: clamp(-23, 23, await getTimeValue(options, 'hours')) * 3600 +
							clamp(-59, 59, await getTimeValue(options, 'minutes')) * 60 +
							clamp(-59, 59, await getTimeValue(options, 'seconds'))

				let newTime = currentTime + offset

				const oneDay = 24 * 3600
				newTime = newTime % oneDay
				if (newTime < 0) newTime += oneDay

				const time: DisplayClock.DisplayClockTime = {
					hours: Math.floor(newTime / 3600),
					minutes: Math.floor((newTime % 3600) / 60),
					seconds: newTime % 60,
					frames: 0,
				}

				await atem?.setDisplayClockProperties({
					startFrom: time,
				})
			},
		},
	}
}
