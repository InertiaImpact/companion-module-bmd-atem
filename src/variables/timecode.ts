import type { InstanceBaseExt } from '../util.js'
import { Enums, type AtemState } from 'atem-connection'
import { formatDurationSeconds } from './util.js'
import type { VariablesSchema } from './schema.js'

function formatClockParts(totalSeconds: number) {
	const hours = Math.floor(totalSeconds / 3600)
	const minutes = Math.floor((totalSeconds % 3600) / 60)
	const seconds = totalSeconds % 60

	return {
		hh: `${hours}`.padStart(2, '0'),
		mm: `${minutes}`.padStart(2, '0'),
		ss: `${seconds}`.padStart(2, '0'),
	}
}

function formatDisplayClockMode(mode: Enums.DisplayClockClockMode | undefined): 'down' | 'up' | 'time' | '' {
	switch (mode) {
		case Enums.DisplayClockClockMode.Countdown:
			return 'down'
		case Enums.DisplayClockClockMode.Countup:
			return 'up'
		case Enums.DisplayClockClockMode.TimeOfDay:
			return 'time'
		default:
			return ''
	}
}

export function updateTimecodeVariables(
	instance: InstanceBaseExt,
	state: AtemState,
	values: Partial<VariablesSchema>,
): void {
	values['timecode'] = formatDurationSeconds(instance.timecodeSeconds).hms
	// values['timecode_ms'] = formatDurationSeconds(instance.timecodeSeconds).hms
	values['display_clock'] = formatDurationSeconds(instance.displayClockSeconds).hms
	const currentClockParts = formatClockParts(instance.displayClockSeconds)
	values['display_clock_hh'] = currentClockParts.hh
	values['display_clock_mm'] = currentClockParts.mm
	values['display_clock_ss'] = currentClockParts.ss

	const displayClockStart = state.displayClock?.properties?.startFrom
	const displayClockStartSeconds = displayClockStart
		? displayClockStart.hours * 3600 + displayClockStart.minutes * 60 + displayClockStart.seconds
		: 0
	values['display_clock_configured'] = formatDurationSeconds(displayClockStartSeconds).hms
	const startClockParts = formatClockParts(displayClockStartSeconds)
	values['display_clock_configured_hh'] = startClockParts.hh
	values['display_clock_configured_mm'] = startClockParts.mm
	values['display_clock_configured_ss'] = startClockParts.ss

	const displayClockProperties = state.displayClock?.properties
	values['display_clock_configured_mode_id'] = displayClockProperties?.clockMode ?? ''
	values['display_clock_configured_mode'] = formatDisplayClockMode(displayClockProperties?.clockMode)
}
