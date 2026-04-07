import { Enums, type Atem, type DisplayClock } from 'atem-connection'
import type { CompanionActionContext, CompanionActionDefinitions, CompanionOptionValues } from '@companion-module/base'
import { convertOptionsFields } from '../options/util.js'
import {
	AtemDisplayClockPropertiesPickers,
	AtemDisplayClockTimeOffsetPickers,
	AtemDisplayClockTimePickers,
} from '../options/displayClock.js'
import type { ModelSpec } from '../models/index.js'
import type { StateWrapper } from '../state.js'
import { ActionId } from './ActionId.js'

export type AtemDisplayClockActions = {
	[ActionId.DisplayClockState]: {
		options: {
			state: 'toggle' | Enums.DisplayClockClockState
		}
	}
	[ActionId.DisplayClockConfigure]: {
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
	[ActionId.DisplayClockStartTime]: {
		options: {
			hours: number
			hoursVar: string
			minutes: number
			minutesVar: string
			seconds: number
			secondsVar: string
			useVariable: boolean
		}
	}
	[ActionId.DisplayClockOffsetStartTime]: {
		options: {
			hours: number
			hoursVar: string
			minutes: number
			minutesVar: string
			seconds: number
			secondsVar: string
			useVariable: boolean
		}
	}
	[ActionId.DisplayClockStartTimeHms]: {
		options: {
			time: string
		}
	}
	[ActionId.DisplayClockSetStartHours]: {
		options: {
			hours: string
		}
	}
	[ActionId.DisplayClockSetStartMinutes]: {
		options: {
			minutes: string
		}
	}
	[ActionId.DisplayClockSetStartSeconds]: {
		options: {
			seconds: string
		}
	}
}

function clamp(min: number, max: number, value: number): number {
	return Math.min(max, Math.max(min, Math.floor(value)))
}

function getCurrentDisplayClockStartTime(state: StateWrapper): DisplayClock.DisplayClockTime {
	const clockState = state.state.displayClock?.properties?.startFrom
	if (clockState) {
		return {
			hours: clockState.hours,
			minutes: clockState.minutes,
			seconds: clockState.seconds,
			frames: 0,
		}
	}

	return {
		hours: 0,
		minutes: 0,
		seconds: 0,
		frames: 0,
	}
}

function parseDisplayClockHms(rawTime: string): DisplayClock.DisplayClockTime {
	const parts = rawTime
		.trim()
		.split(':')
		.map((part) => Number(part.trim()))

	if (parts.length !== 3 || parts.some((part) => isNaN(part))) {
		throw new Error(`Invalid time '${rawTime}'. Expected HH:MM:SS`)
	}

	return {
		hours: clamp(0, 23, parts[0]),
		minutes: clamp(0, 59, parts[1]),
		seconds: clamp(0, 59, parts[2]),
		frames: 0,
	}
}

async function parseNumberField(context: CompanionActionContext, value: unknown, label: string): Promise<number> {
	const parsed = await context.parseVariablesInString(String(value ?? ''))
	const num = Number(parsed)
	if (isNaN(num)) {
		throw new Error(`Invalid numeric value for ${label}: ${parsed}`)
	}
	return num
}

async function getTimeValue(
	context: CompanionActionContext,
	options: CompanionOptionValues,
	field: 'hours' | 'minutes' | 'seconds',
): Promise<number> {
	if (options.useVariable) {
		return parseNumberField(context, options[`${field}Var`], field)
	}

	const raw = options[field]
	if (typeof raw === 'number') return raw
	if (raw !== undefined && raw !== null && raw !== '') return parseNumberField(context, raw, field)

	return 0
}

export function createDisplayClockActions(
	atem: Atem | undefined,
	model: ModelSpec,
	state: StateWrapper,
): CompanionActionDefinitions {
	if (!model.displayClock) {
		return {
			[ActionId.DisplayClockState]: undefined,
			[ActionId.DisplayClockConfigure]: undefined,
			[ActionId.DisplayClockStartTime]: undefined,
			[ActionId.DisplayClockOffsetStartTime]: undefined,
			[ActionId.DisplayClockStartTimeHms]: undefined,
			[ActionId.DisplayClockSetStartHours]: undefined,
			[ActionId.DisplayClockSetStartMinutes]: undefined,
			[ActionId.DisplayClockSetStartSeconds]: undefined,
		}
	}
	return {
		[ActionId.DisplayClockState]: {
			name: 'Display Clock: Start/Stop',
			options: convertOptionsFields<any, any>({
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
			callback: async ({ options }: any) => {
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
		[ActionId.DisplayClockConfigure]: {
			name: 'Display Clock: Configure',
			options: convertOptionsFields({
				...AtemDisplayClockPropertiesPickers(),
			}),
			callback: async ({ options }: any) => {
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
		[ActionId.DisplayClockStartTime]: {
			name: 'Display Clock: Set Start Time',
			options: convertOptionsFields({ ...AtemDisplayClockTimePickers() }),
			callback: async ({ options }: any, context: CompanionActionContext) => {
				const hours = clamp(0, 23, await getTimeValue(context, options, 'hours'))
				const minutes = clamp(0, 59, await getTimeValue(context, options, 'minutes'))
				const seconds = clamp(0, 59, await getTimeValue(context, options, 'seconds'))

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
		[ActionId.DisplayClockOffsetStartTime]: {
			name: 'Display Clock: Offset Start Time',
			options: convertOptionsFields({ ...AtemDisplayClockTimeOffsetPickers() }),
			callback: async ({ options }: any, context: CompanionActionContext) => {
				const clockState = state.state.displayClock?.properties?.startFrom
				const currentTime = clockState ? clockState.hours * 3600 + clockState.minutes * 60 + clockState.seconds : 0

				const offset =
					clamp(-23, 23, await getTimeValue(context, options, 'hours')) * 3600 +
					clamp(-59, 59, await getTimeValue(context, options, 'minutes')) * 60 +
					clamp(-59, 59, await getTimeValue(context, options, 'seconds'))

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
		[ActionId.DisplayClockStartTimeHms]: {
			name: 'Display Clock: Set Start Time (HH:MM:SS)',
			options: convertOptionsFields<any, any>({
				time: {
					type: 'textinput',
					id: 'time',
					label: 'Time (HH:MM:SS)',
					default: '00:00:00',
					useVariables: true,
				},
			}),
			callback: async ({ options }: any, context: CompanionActionContext) => {
				const rawTime = await context.parseVariablesInString(String(options.time ?? ''))
				const time = parseDisplayClockHms(rawTime)

				await atem?.setDisplayClockProperties({
					startFrom: time,
				})
			},
			learn: () => {
				const displayClockConfig = state.state.displayClock?.properties
				if (displayClockConfig) {
					return {
						time: `${displayClockConfig.startFrom.hours.toString().padStart(2, '0')}:${displayClockConfig.startFrom.minutes
							.toString()
							.padStart(2, '0')}:${displayClockConfig.startFrom.seconds.toString().padStart(2, '0')}`,
					}
				}
				return undefined
			},
		},
		[ActionId.DisplayClockSetStartHours]: {
			name: 'Display Clock: Set Start Hours',
			options: convertOptionsFields<any, any>({
				hours: {
					type: 'textinput',
					id: 'hours',
					label: 'Hours',
					default: '0',
					useVariables: true,
				},
			}),
			callback: async ({ options }: any, context: CompanionActionContext) => {
				const current = getCurrentDisplayClockStartTime(state)
				current.hours = clamp(0, 23, await parseNumberField(context, options.hours, 'hours'))

				await atem?.setDisplayClockProperties({
					startFrom: current,
				})
			},
		},
		[ActionId.DisplayClockSetStartMinutes]: {
			name: 'Display Clock: Set Start Minutes',
			options: convertOptionsFields<any, any>({
				minutes: {
					type: 'textinput',
					id: 'minutes',
					label: 'Minutes',
					default: '0',
					useVariables: true,
				},
			}),
			callback: async ({ options }: any, context: CompanionActionContext) => {
				const current = getCurrentDisplayClockStartTime(state)
				current.minutes = clamp(0, 59, await parseNumberField(context, options.minutes, 'minutes'))

				await atem?.setDisplayClockProperties({
					startFrom: current,
				})
			},
		},
		[ActionId.DisplayClockSetStartSeconds]: {
			name: 'Display Clock: Set Start Seconds',
			options: convertOptionsFields<any, any>({
				seconds: {
					type: 'textinput',
					id: 'seconds',
					label: 'Seconds',
					default: '0',
					useVariables: true,
				},
			}),
			callback: async ({ options }: any, context: CompanionActionContext) => {
				const current = getCurrentDisplayClockStartTime(state)
				current.seconds = clamp(0, 59, await parseNumberField(context, options.seconds, 'seconds'))

				await atem?.setDisplayClockProperties({
					startFrom: current,
				})
			},
		},
	}
}
