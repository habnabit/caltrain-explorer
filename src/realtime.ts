import * as gtfsRealtime from 'gtfs-rt-bindings'
import { List, Record, Seq } from 'immutable'
import * as moment from 'moment'
import Pbf = require('pbf')
import * as qs from 'qs'
import { Epic } from 'redux-observable'
import { forkJoin, from, interval, merge, Observable, ObservableInput, of, timer } from 'rxjs'
import { catchError, delay, filter, map, mergeMap, switchMap, tap } from 'rxjs/operators'
import { ActionType, getType, isActionOf } from 'typesafe-actions'

import * as actions from './actions'
import * as caltrain from './caltrain'
import { isOk, Type as Result } from './result'


type AllActions = ActionType<typeof actions>

const API_KEY = '711ca03b-2281-46a2-94eb-6fc53aec0c27'
const AGENCY = 'CT'
const API_QS = qs.stringify({
    api_key: API_KEY,
    agency: AGENCY,
})

function englishTranslationOf(description: {translation: {text: string, language: string}[]}): string {
    return Seq.Indexed(description.translation)
        .flatMap(({text, language}) => language == 'en' || language === null? [text] : [])
        .first()
}

type EnumMap = {[key: string]: number}

function reverseEnum(value: number, enumMap: EnumMap): string {
    return Seq.Keyed(enumMap).findEntry((n) => n == value)[0]
}

type RawGtfs = {
    inner: any
    outer: any
}

export class TripUpdate extends Record({
    kind: 'tripUpdate' as 'tripUpdate',
    _raw: {} as RawGtfs,
    tripStop: undefined as caltrain.TripStopKey,
    departure: undefined as moment.Moment,
}) {
    static fromPbf(update: any): Seq.Indexed<RealtimeUpdate> {
        const tripId = caltrain.isoTripId.wrap(update.trip.trip_id)
        return Seq.Indexed(update.stop_time_update as any[]).map((stopUpdate) => {
            const stopId = caltrain.isoStopId.wrap(stopUpdate.stop_id)
            const departure = moment(stopUpdate.departure.time * 1000).local()
            const tripStop = new caltrain.TripStopKey({tripId, stopId})
            return new TripUpdate({tripStop, departure, _raw: {inner: stopUpdate, outer: update}})
        })
    }
}

export class ServiceAlert extends Record({
    kind: 'serviceAlert' as 'serviceAlert',
    _raw: {} as RawGtfs,
    activeSince: undefined as moment.Moment,
    activeUntil: undefined as moment.Moment,
    cause: '',
    effect: '',
    header: '',
    description: '',
    routeIds: List<caltrain.RouteId>(),
    stopIds: List<caltrain.StopId>(),
}) {
    static fromPbf(alert: any): Seq.Indexed<RealtimeUpdate> {
        const routeIds = [] as caltrain.RouteId[]
        const stopIds = [] as caltrain.StopId[]
        const matchingEntities = Seq.Indexed(alert.informed_entity as {agency_id: string, route_id: string, stop_id: string}[])
            .filter((e) => {
                if (e.agency_id != AGENCY) {
                    return false
                }
                if (e.route_id !== null && e.route_id != '') {
                    routeIds.push(caltrain.isoRouteId.wrap(e.route_id))
                }
                if (e.stop_id !== null && e.stop_id != '') {
                    stopIds.push(caltrain.isoStopId.wrap(e.stop_id))
                }
                return true
            })
            .count()
        if (matchingEntities == 0) {
            return Seq.Indexed()
        }
        const now = moment()
        const active = Seq.Indexed(alert.active_period as {start: number, end: number}[])
            .flatMap(({start, end}) => {
                const activeSince = moment(start * 1000).local()
                const activeUntil = moment(end * 1000).local()
                if (now.isBetween(activeSince, activeUntil)) {
                    return [{activeSince, activeUntil}]
                } else {
                    return []
                }
            })
            .first()
        if (active === undefined) {
            return Seq.Indexed()
        }
        return Seq.Indexed([
            new ServiceAlert(Object.assign({
                cause: reverseEnum(alert.cause, gtfsRealtime.Alert.Cause),
                effect: reverseEnum(alert.effect, gtfsRealtime.Alert.Effect),
                header: englishTranslationOf(alert.header_text),
                description: englishTranslationOf(alert.description_text),
                routeIds: List(routeIds),
                stopIds: List(stopIds),
                _raw: {inner: alert},
            }, active)),
        ])
    }
}

export class VehiclePosition extends Record({
    kind: 'vehiclePosition' as 'vehiclePosition',
    _raw: {} as RawGtfs,
}) {
    static fromPbf(vehicle: any): Seq.Indexed<RealtimeUpdate> {
        return Seq.Indexed()
    }
}

export type RealtimeUpdate = TripUpdate | ServiceAlert | VehiclePosition
type FetchedAndParsed = Result<{
    updates: List<RealtimeUpdate>,
    timestamp: moment.Moment,
}>

const fetchAndParse: (url: string) => Observable<FetchedAndParsed> = (url: string) => of(url).pipe(
    switchMap((url: string) => fetch(url)),
    switchMap((r: Response) => r.arrayBuffer()),
    map((buf): FetchedAndParsed => {
        const p = new Pbf(new Uint8Array(buf))
        const feed = gtfsRealtime.FeedMessage.read(p)
        const updates = List<RealtimeUpdate>().withMutations((ret) => {
            for (const entity of feed.entity) {
                if (entity.trip_update !== null) {
                    ret.concat(TripUpdate.fromPbf(entity.trip_update))
                } else if (entity.alert !== null) {
                    ret.concat(ServiceAlert.fromPbf(entity.alert))
                } else if (entity.vehicle !== null) {
                    ret.concat(VehiclePosition.fromPbf(entity.vehicle))
                }
            }
        })
        const timestamp = moment(feed.header.timestamp * 1000)
        return { updates, timestamp }
    }),
    catchError<FetchedAndParsed, FetchedAndParsed>((error) => of(error)),
)

export const fetchRealtime: Epic<AllActions, AllActions> = (action$) => (
    action$.pipe(
        filter(isActionOf(actions.fetchRealtime.request)),
        switchMap((action) => {
            return of([
                'https://api.511.org/transit/tripupdates?' + API_QS,
                'https://api.511.org/transit/servicealerts?' + API_QS,
                'https://api.511.org/transit/vehiclepositions?' + API_QS,
            ]).pipe(
                mergeMap<string[], FetchedAndParsed[]>((urls) => forkJoin(...urls.map((url) => fetchAndParse(url)))),
            )
        }),
        mergeMap((results: FetchedAndParsed[]) => {
            const ret: AllActions[] = []
            let latestTimestamp: moment.Moment | undefined = undefined
            const updates = List<RealtimeUpdate>().withMutations((u) => {
                for (const r of results) {
                    if (isOk(r)) {
                        u.concat(r.updates)
                        if (latestTimestamp === undefined || r.timestamp.isAfter(latestTimestamp)) {
                            latestTimestamp = r.timestamp
                        }
                    } else {
                        ret.push(actions.fetchRealtime.failure(r))
                    }
                }
            })
            const dataFrom = latestTimestamp !== undefined? latestTimestamp : moment()
            const nextFetchAt = dataFrom.clone().add(1, 'minute')
            ret.push(actions.fetchRealtime.success({updates, dataFrom}))
            ret.push(actions.requestRealtimeAt({at: nextFetchAt}))
            return ret
        }),
    )
)

export const scheduleRealtime: Epic<AllActions, AllActions> = (action$) => (
    merge(
        action$.pipe(
            filter(isActionOf(actions.initRealtime)),
            map(() => actions.fetchRealtime.request()),
        ),
        action$.pipe(
            filter(isActionOf(actions.requestRealtimeAt)),
            switchMap((action) => of(actions.fetchRealtime.request()).pipe(
                delay(action.payload.at.toDate())
            )),
        ),
    )
)
