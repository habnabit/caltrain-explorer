import { createStandardAction } from 'typesafe-actions'
import { StopName } from './caltrain'
import { ShowDate } from './index'


export const toggleStopSelection = createStandardAction('caltrain/toggleStopSelection')<{
    stop: StopName
}>()

export const selectReferenceStop = createStandardAction('caltrain/selectReferenceStop')<{
    stop: StopName
}>()

export const setDate = createStandardAction('caltrain/setDate')<{
    date: ShowDate
}>()
