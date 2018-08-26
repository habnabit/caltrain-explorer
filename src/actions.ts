import { List } from 'immutable'
import { createAsyncAction, createStandardAction } from 'typesafe-actions'

import { StopName } from './caltrain'
import { ShowDate } from './index'
import { RealtimeUpdate } from './realtime'


export const toggleStopSelection = createStandardAction('caltrain/toggleStopSelection')<{
    stop: StopName
}>()

export const selectReferenceStop = createStandardAction('caltrain/selectReferenceStop')<{
    stop: StopName
}>()

export const setDate = createStandardAction('caltrain/setDate')<{
    date: ShowDate
}>()

export const fetchRealtime = createAsyncAction('caltrain/fetchRealtimeRequest', 'caltrain/fetchRealtimeSuccess', 'caltrain/fetchRealtimeFailure')<void, {
    updates: List<RealtimeUpdate>
}, Error>()
