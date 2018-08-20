import { List } from 'immutable'
import { Lens } from 'monocle-ts'
import { createAsyncAction, createStandardAction } from 'typesafe-actions'
import { ShowDate } from './index'


export const toggleStopSelection = createStandardAction('caltrain/toggleStopSelection')<{
    stop: string
}>()

export const setDate = createStandardAction('caltrain/setDate')<{
    date: ShowDate
}>()
