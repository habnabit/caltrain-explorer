import * as gtfsRealtime from 'gtfs-rt-bindings'
import { Map, Seq, Record, List } from 'immutable'
import * as moment from 'moment'
import * as Pbf from 'pbf'
import * as qs from 'qs'
import { Epic } from 'redux-observable'
import { from, of, merge, interval } from 'rxjs'
import { filter, switchMap, map, catchError, delay, tap } from 'rxjs/operators'
import { ActionType, getType, isActionOf } from 'typesafe-actions'

import * as actions from './actions'
import * as caltrain from './caltrain'


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

export class TripUpdate extends Record({
    kind: 'tripUpdate' as 'tripUpdate',
    tripStop: undefined as caltrain.TripStopKey,
    departure: undefined as moment.Moment,
    delay: 0,
}) {
    static fromPbf(update: any): Seq.Indexed<RealtimeUpdate> {
        let tripId = caltrain.isoTripId.wrap(update.trip.trip_id)
        return Seq.Indexed(update.stop_time_update as any[]).map((stopUpdate) => {
            let stopId = caltrain.isoStopId.wrap(stopUpdate.stop_id)
            let departure = moment(stopUpdate.departure.time * 1000)
            let delay = stopUpdate.departure.delay as number
            let tripStop = new caltrain.TripStopKey({tripId, stopId})
            return new TripUpdate({tripStop, departure, delay})
        })
    }
}

export class ServiceAlert extends Record({
    kind: 'serviceAlert' as 'serviceAlert',
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
        let routeIds = [] as caltrain.RouteId[]
        let stopIds = [] as caltrain.StopId[]
        let matchingEntities = Seq.Indexed(alert.informed_entity as {agency_id: string, route_id: string, stop_id: string}[])
            .filter(e => {
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
        let now = moment()
        let active = Seq.Indexed(alert.active_period as {start: number, end: number}[])
            .flatMap(({start, end}) => {
                let activeSince = moment(start * 1000)
                let activeUntil = moment(end * 1000)
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
            }, active))
        ])
    }
}

export class VehiclePosition extends Record({
    kind: 'vehiclePosition' as 'vehiclePosition',
}) {
    static fromPbf(vehicle: any): Seq.Indexed<RealtimeUpdate> {
        return Seq.Indexed()
    }
}

export type RealtimeUpdate = TripUpdate | ServiceAlert | VehiclePosition

export const fetchRealtime: Epic<AllActions, AllActions> = (action$) => (
    action$.pipe(
        filter(isActionOf(actions.fetchRealtime.request)),
        switchMap(_action => {
            return merge(
                from(fetch('https://api.511.org/transit/tripupdates?' + API_QS)),
                from(fetch('https://api.511.org/transit/servicealerts?' + API_QS)),
                from(fetch('https://api.511.org/transit/vehiclepositions?' + API_QS)),
            ).pipe(
                switchMap((r: Response) => r.arrayBuffer()),
            )
        }),
        map((buf) => {
            let p = new Pbf(new Uint8Array(buf))
            let feed = gtfsRealtime.FeedMessage.read(p)
            return List<RealtimeUpdate>().withMutations(ret => {
                for (let entity of feed.entity) {
                    if (entity.trip_update !== null) {
                        ret.concat(TripUpdate.fromPbf(entity.trip_update))
                    } else if (entity.alert !== null) {
                        ret.concat(ServiceAlert.fromPbf(entity.alert))
                    } else if (entity.vehicle !== null) {
                        ret.concat(VehiclePosition.fromPbf(entity.vehicle))
                    }
                }
            })
        }),
        tap((updates) => console.log(updates.toJS())),
        map((updates) => actions.fetchRealtime.success({updates})),
        catchError((error) => of(actions.fetchRealtime.failure(error))),
        (prev => merge(
            interval(60000).pipe(
                map((count) => actions.fetchRealtime.request()),
            ),
            prev,
        )),
        tap((action) => {
            console.log(action)
        }),
    )
)
