import * as React from 'react'
import * as ReactDOM from 'react-dom'
import { Provider, connect } from 'react-redux'
import { onlyUpdateForKeys, compose, withState, mapPropsStream } from 'recompose'
import { createStore, DeepPartial, Reducer, Store, Dispatch, bindActionCreators, AnyAction, applyMiddleware, Middleware } from 'redux'
import { createEpicMiddleware } from 'redux-observable'
import { List, Record, Set, OrderedSet, Map, Seq } from 'immutable'
import * as moment from 'moment'
import { isMoment } from 'moment'
import * as transit from 'transit-immutable-js'
import { ActionType, getType } from 'typesafe-actions'

import './site.sass'
import * as actions from './actions'
import * as caltrain from './caltrain'
import * as realtime from './realtime'
import { interval, combineLatest, merge, of } from 'rxjs';
import { map } from 'rxjs/operators';


(function() {
    if ('serviceWorker' in navigator && location.protocol != 'file:') {
        navigator.serviceWorker.register('service-worker.js')
    }
})()


function momentsAndOrEqual<T>(a: T, b: T): boolean {
    return (isMoment(a) && isMoment(b) && a.isSame(b)) || a == b
}

let StopsElement = onlyUpdateForKeys(
    ['selection', 'zoneStops']
)((props: {
    selection: Selection
    zoneStops: Map<caltrain.FareZone, List<caltrain.StopName>>
    onToggle: typeof actions.toggleStopSelection
}) => {
    return <div className="flex read_xl justify-between">
        {props.zoneStops.entrySeq().map(([zone, stops], i) => <div key={i} className="flex gap-no read_xl ma-t_s">
            {stops.map((name, j) => <label key={j} className="box">
                <input className="checkbox" type="checkbox" checked={props.selection.checkedStops.has(name)} onChange={() => props.onToggle({stop: name})} /> {name}
            </label>)}
        </div>)}
    </div>
})

const ConnectedStopsElement = connect(
    (top: State) => {
        let { selection, zoneStops } = top
        return { selection, zoneStops }
    },
    (d: Dispatch) => bindActionCreators({
        onToggle: actions.toggleStopSelection,
    }, d),
    undefined,
    {
        areStatesEqual: (x, y) => x.selection === y.selection && momentsAndOrEqual(x.date, y.date),
        areStatePropsEqual: (x, y) => x.selection === y.selection && x.zoneStops === y.zoneStops,
    },
)(StopsElement)

export type ShowDate = 'today' | 'tomorrow' | moment.Moment

let DateElement = onlyUpdateForKeys(
    ['date']
)((props: {
    date: ShowDate
    onSetDate: typeof actions.setDate
}) => {
    let active
    let momentBox = <></>
    switch (props.date) {
    case 'today': active = 'today'; break
    case 'tomorrow': active = 'tomorrow'; break
    default:
        active = 'moment'
        momentBox = <input className="input" type="date" value={props.date.format('YYYY-MM-DD')} onChange={ev => props.onSetDate({date: moment(ev.target.value)})} />
    }
    return <div className="flex gap-no read_l pa-v_s">
        <a className={"box " + (active == 'today'? 'active' : '')} onClick={() => props.onSetDate({date: 'today'})}>Today</a>
        <a className={"box " + (active == 'tomorrow'? 'active' : '')} onClick={() => props.onSetDate({date: 'tomorrow'})}>Tomorrow</a>
        <a className={"box " + (active == 'moment'? 'active' : '')} onClick={() => props.onSetDate({date: moment()})}>Date…</a>
        {momentBox}
    </div>
})

const ConnectedDateElement = connect(
    (top: State) => {
        let { date } = top
        return { date }
    },
    (d: Dispatch) => bindActionCreators({
        onSetDate: actions.setDate,
    }, d),
    undefined,
    {
        areStatesEqual: (x, y) => momentsAndOrEqual(x.date, y.date),
        areStatePropsEqual: (x, y) => momentsAndOrEqual(x.date, y.date),
    },
)(DateElement)

let TripElement = onlyUpdateForKeys(
    ['selection', 'show', 'trip', 'stops', 'date', 'tripUpdates']
)((props: {
    selection: Selection
    show: Set<caltrain.StopName>
    trip: caltrain.Trip
    stops: caltrain.AlignedStops
    date: moment.Moment
    tripUpdates: TripUpdates
    onSelectReference: typeof actions.selectReferenceStop
}) => {
    let stops = props.stops.filter(([s, _ts]) => props.show.has(s.name))
    if (!stops.some(([_s, ts]) => ts != 'never' && ts != 'skipped')) {
        return <></>
    }
    let firstDeparture = stops
        .valueSeq()
        .flatMap(([s, ts]) => s.name == props.selection.referenceStop && ts instanceof caltrain.TripStop? [ts.departureFor(props.date)] : [])
        .first()
    let now = moment()
    let currentStop: 'searching' | 'found' = 'searching'
    return <tr>
        <td>{props.trip.shortName}</td>
        {stops.map(([s, ts], e) => {
            let cell
            let realtimeDelay: number | undefined = undefined
            let parts = ['']
            function addPart(value: number | undefined, neg: string, pos: string): void {
                if (value === undefined) {
                } else if (value > 0) {
                    parts.push(`${pos}${value}m`)
                } else if (value < 0) {
                    parts.push(`${neg}${-value}m`)
                }
            }

            if (ts == 'never') {
                if (e != 0 && stops.get(e - 1)[1] != 'never') {
                    cell = '⊁'
                } else if (e != stops.size - 1 && stops.get(e + 1)[1] != 'never') {
                    cell = '⊀'
                } else {
                    cell = ''
                }
            } else if (props.selection.checkedStops.has(s.name)) {
                if (ts == 'skipped') {
                    cell = '–'
                } else {
                    let realtimeKey = new caltrain.TripStopKey({tripId: props.trip.id, stopId: s.id})
                    let realtime = props.tripUpdates.get(realtimeKey)
                    let stopDate: moment.Moment
                    let scheduled = ts.departureFor(props.date)
                    if (realtime !== undefined) {
                        stopDate = realtime.departure
                        realtimeDelay = stopDate.diff(scheduled, 'minute')
                        if (realtimeDelay < -12 * 60) {
                            [stopDate, realtimeDelay] = [scheduled, undefined]
                        } else if (realtimeDelay > 0 || realtimeDelay < 0) {
                            console.log({realtimeDelay, realtime})
                        }
                    } else {
                        stopDate = scheduled
                    }
                    cell = stopDate.format('HH:mm')
                    addPart(realtimeDelay, '≫', '≪')
                    addPart(
                        firstDeparture !== undefined? stopDate.diff(firstDeparture, 'minutes') : undefined,
                        '≺', '≻')
                    let untilStop = stopDate.diff(now, 'minutes')
                    if (currentStop == 'searching' && untilStop > 0) {
                        if (untilStop < 3 * 60) {
                            cell = `➘${cell}`
                        }
                        currentStop = 'found'
                    }
                    if (Math.abs(untilStop) < 3 * 60) {
                        addPart(untilStop, '➚', '➘')
                    }
                }
            } else {
                cell = '⋯'
            }
            parts[0] = cell

            let classes = ['text-center']
            if (realtimeDelay !== undefined) {
                classes.push('realtime')
                let theme = realtimeDelay > 0? 'danger'  // late
                    : realtimeDelay < 0? 'warning'  // early
                    : 'success'  // on time
                classes.push('tinted-bg-' + theme)
            } else if (props.selection.referenceStop == s.name) {
                classes.push('reference-col')
            }
            return <td key={e} className={classes.join(' ')} onClick={() => props.onSelectReference({stop: s.name})}>{parts.join(' ')}</td>
        })}
    </tr>
})

let TripsElement = onlyUpdateForKeys(
    ['direction', 'selection', 'trips', 'date', 'tripUpdates']
)((props: {
    direction: caltrain.Direction
    selection: Selection
    trips: List<caltrain.Trip>
    date: moment.Moment
    tripUpdates: TripUpdates
    onSelectReference: typeof actions.selectReferenceStop
}) => {
    if (props.trips.isEmpty()) {
        return <></>
    }
    let aTrip = props.trips.first()
    let service = new caltrain.ServiceStopKey(aTrip)
    let allStops = caltrain.serviceStops.get(service)
    let show = props.selection.stopsToShow(allStops)
    return <table className="table bo-no fixed dense trip-table">
        <thead>
            <tr>
                <th>{props.direction}</th>
                {show.valueSeq().map((stop, e) => <th key={e} className={props.selection.referenceStop == stop? 'reference-col' : ''} onClick={() => props.onSelectReference({stop})}>{props.selection.checkedStops.has(stop)? stop : '⋯'}</th>)}
            </tr>
        </thead>
        <tbody>
            {props.trips.map((trip, e) => {
                let stops = trip.stopsAlignedTo(allStops)
                return <TripElement key={e} {...{show, trip, stops}} {...props} />
            })}
        </tbody>
    </table>
})

const ConnectedTripsElement = connect(
    (top: State) => {
        let { tripUpdates } = top
        return { tripUpdates }
    },
    (d: Dispatch) => bindActionCreators({
        onSelectReference: actions.selectReferenceStop,
    }, d),
)(TripsElement)

let ServicesElement = onlyUpdateForKeys(
    ['selection', 'date']
)((props: {
    selection: Selection
    date: moment.Moment
}) => {
    let services = caltrain.servicesFor(props.date)
    let stops = props.selection.checkedStops
    let allServices = Set.intersect<caltrain.ServiceStopKey>(
        stops
            .map(s => caltrain.serviceStopKeysByStopName.get(s)))
        .filter(s => services.has(s.serviceId))
    let trips = allServices
        .valueSeq()
        .flatMap(s => caltrain.tripsByService.get(s))
        .groupBy(s => s.direction)
        .map(collected => collected
            .valueSeq()
            .map(t => [
                t,
                caltrain.tripStops.get(t.id)
                    .filter(ts => stops.has(ts.stop.name))
                    .map(ts => [ts, ts.departureFor(props.date)])
            ] as [caltrain.Trip, List<[caltrain.TripStop, moment.Moment]>])
            .filter(([_t, tsl]) => tsl.some(([_ts, departure]) => departure.isAfter(props.date)))
            .sortBy(([_t, tsl]) => tsl.first()[1])
            .map(([t, _tsl]) => t)
            .toList())
        .entrySeq()
        .sortBy(([k, _v]) => k)
    return <>{trips.map(([direction, trips], e) => <div key={e} className="span-12 pa-v_s">
        <ConnectedTripsElement {...{direction, trips}} {...props} />
    </div>)}</>
})

const ConnectedServicesElement = connect(
    (top: State) => {
        let { selection } = top
        return { selection, date: top.dateMoment() }
    },
    undefined,
    undefined,
    {
        areStatesEqual: (x, y) => x.selection === y.selection && momentsAndOrEqual(x.date, y.date),
        areStatePropsEqual: (x, y) => x.selection === y.selection && momentsAndOrEqual(x.date, y.date),
    },
)(ServicesElement)

type FetchState = 'idle' | 'fetching' | moment.Moment

const enhanceWithNow = mapPropsStream((props$) => {
    return combineLatest(
        props$,
        merge(of(0), interval(5000)),
    ).pipe(
        map(([props, _interval]) => ({...props, now: moment()}))
    )
})

const RealtimeFetchElement = compose<{
    fetchState: FetchState
    dataFrom: moment.Moment | undefined
    now: moment.Moment
    onRefetch: typeof actions.fetchRealtime.request
}, {}>(
    onlyUpdateForKeys(['fetchState', 'dataFrom']),
    enhanceWithNow,
)((props) => {
    let staleness, dataStatus, tint
    if (props.dataFrom !== undefined) {
        staleness = `${props.now.diff(props.dataFrom, 'seconds')}s stale`
        dataStatus = 'Realtime data shown'
        tint = 'success'
    } else {
        staleness = 'never fetched'
        dataStatus = 'No realtime data'
        tint = 'danger'
    }
    let nextFetch = props.fetchState == 'fetching'? 'fetching'
        : props.fetchState == 'idle'? ''
        : `fetch in ${props.fetchState.diff(props.now, 'seconds')}s`
    return <div className={`pos-sticky zi-4 box bg-0 tinted-${tint}`} style={({
        width: '30rem',
        maxWidth: '100%',
        top: 'var(--space-m)',
    })}>
        <div className="grid gap-no">
            <div className="box bg-1 span-12">{dataStatus}</div>
            <div className="box bg-1 span-4">{staleness}</div>
            <div className="box bg-1 span-4">{nextFetch}</div>
            <button className="button span-4" onClick={() => props.onRefetch()}>Refetch</button>
        </div>
    </div>
})

const ConnectedRealtimeFetchElement = connect(
    (top: State) => {
        let { fetchState, dataFrom } = top
        return { fetchState, dataFrom }
    },
    (d: Dispatch) => bindActionCreators({
        onRefetch: actions.fetchRealtime.request,
    }, d),
    undefined,
    {
        areStatesEqual: (x, y) => momentsAndOrEqual(x.fetchState, y.fetchState) && momentsAndOrEqual(x.dataFrom, y.dataFrom),
        areStatePropsEqual: (x, y) => momentsAndOrEqual(x.fetchState, y.fetchState) && momentsAndOrEqual(x.dataFrom, y.dataFrom),
    },
)(RealtimeFetchElement)

export class Selection extends Record({
    checkedStops: Set<caltrain.StopName>(),
    referenceStop: undefined as caltrain.StopName | undefined,
}) {
    toggleChecked(stop: caltrain.StopName): this {
        return this.update('checkedStops', s => {
            if (s.has(stop)) {
                return s.remove(stop)
            } else {
                return s.add(stop)
            }
        })
    }

    recheckingZoneStops(zoneStops: ZoneStops): Selection {
        let visibleStops = zoneStops
            .valueSeq()
            .flatMap(l => l)
            .toSet()
        return new Selection({
            checkedStops: this.checkedStops.intersect(visibleStops),
            referenceStop: visibleStops.get(this.referenceStop),
        })
    }

    stopsToShow(allStops: List<caltrain.Stop>): OrderedSet<caltrain.StopName> {
        let showIndices = allStops
            .toSeq()
            .flatMap((stop, e) => {
                if (this.checkedStops.has(stop.name)) {
                    return [e - 1, e, e + 1]
                } else {
                    return []
                }
            })
            .filter(i => i >= 0 && i < allStops.size)
            .sort()
            .toOrderedSet()
            .toList()
        let selectedIndices = allStops
            .toSeq()
            .flatMap((stop, e) => this.checkedStops.has(stop.name)? [e] : [])
            .toSet()
        return showIndices
            .reduce((ret, i, e, l) => {
                if (e != 0 && e != l.size - 1 && !selectedIndices.has(i) && !selectedIndices.has(l.get(e - 1))) {
                    return ret
                } else {
                    return ret.add(allStops.get(i).name)
                }
            }, OrderedSet<caltrain.StopName>())
    }
}

type TripUpdates = Map<caltrain.TripStopKey, realtime.TripUpdate>
type ZoneStops = Map<caltrain.FareZone, List<caltrain.StopName>>

export class State extends Record({
    selection: new Selection(),
    zoneStops: Map() as ZoneStops,
    date: 'today' as ShowDate,
    tripUpdates: Map() as TripUpdates,
    alerts: List<realtime.ServiceAlert>(),
    fetchState: 'idle' as FetchState,
    dataFrom: undefined as moment.Moment | undefined,
}) {
    dateMoment(): moment.Moment {
        switch (this.date) {
        case 'today': return moment()
        case 'tomorrow': return moment().add(1, 'day').startOf('day')
        default: return this.date.startOf('day')
        }
    }

    withRealtimeUpdates(updatePayload: actions.UpdatePayload): this {
        let alerts = [] as realtime.ServiceAlert[]
        let newUpdates: TripUpdates = Map()
        newUpdates = newUpdates.withMutations(tripUpdates => {
            for (let update of updatePayload.updates) {
                switch (update.kind) {
                case 'tripUpdate': {
                    tripUpdates.set(update.tripStop, update)
                    break
                }
                case 'serviceAlert': {
                    alerts.push(update)
                    break
                }
                }
            }
        })
        return this.merge({
            tripUpdates: newUpdates,
            alerts: List(alerts),
            fetchState: 'idle',
            dataFrom: newUpdates.size == 0? undefined : updatePayload.dataFrom,
        })
    }

    zoneStopsFor(date: moment.Moment = this.dateMoment()) {
        let zoneStops = caltrain.servicesFor(date)
            .valueSeq()
            .flatMap(serviceId => {
                let stops = caltrain.serviceStops.get(
                    new caltrain.ServiceStopKey({serviceId, direction: 'South'}))
                if (stops === undefined) {
                    return []
                }
                return [
                    stops
                        .groupBy(stop => stop.zone)
                        .map(collected => collected
                            .valueSeq()
                            .map(stop => stop.name)
                            .toList())
                        .toMap()
                ]
            })
            .toSet()
        if (zoneStops.size != 1) {
            console.log('oh no zones', zoneStops.toJS())
        }
        return zoneStops.first()
    }

    recheckingStops(updater: (state: State) => State, force = false): State {
        let updated = updater(this)
        if (!force && this.date === updated.date) {
            return updated
        }
        let zoneStops = updated.zoneStopsFor()
        if (!force && this.zoneStops.equals(zoneStops)) {
            return updated
        }
        return updated
            .set('zoneStops', zoneStops)
            .update('selection', sel => sel.recheckingZoneStops(zoneStops))
    }
}

const recordTransit = caltrain.recordTransit.withExtraHandlers([
    {
        tag: '¢_',
        class: State,
        write: (s: State) => [s.selection, s.date],
        read: ([selection, date]: [Selection, ShowDate]): State => new State({selection, date}),
    }, {
        tag: '¢Sl',
        class: Selection,
        write: (sel: Selection) => [sel.checkedStops, sel.referenceStop],
        read: ([checkedStops, referenceStop]: any[]): Selection => new Selection({checkedStops, referenceStop}),
    },
])

type AllActions = ActionType<typeof actions>

function reducer(state = new State(), action: AllActions): State {
    if (state.zoneStops.size == 0) {
        state = state.recheckingStops(s => s, true)
    }

    switch (action.type) {
    case getType(actions.toggleStopSelection): {
        let { stop } = action.payload
        return state.update('selection', s => s.toggleChecked(stop))
    }

    case getType(actions.selectReferenceStop): {
        let { stop } = action.payload
        return state.update('selection', s =>
            s.update('referenceStop', r => r == stop? undefined : stop))
    }

    case getType(actions.setDate): {
        let { date } = action.payload
        return state.recheckingStops(s => s.set('date', date))
    }

    case getType(actions.fetchRealtime.request): {
        return state.set('fetchState', 'fetching')
    }

    case getType(actions.fetchRealtime.success): {
        return state.withRealtimeUpdates(action.payload)
    }

    case getType(actions.requestRealtimeAt): {
        return state.set('fetchState', action.payload.at)
    }

    default: {
        return state
    }
    }
}

const persistState: Middleware = store => next => action => {
    let result = next(action)
    let persisted = recordTransit.toJSON(store.getState())
    localStorage.setItem('state', persisted)
    return result
}

function makeStore(reducer: Reducer<State>): Store<State> {
    let persisted, state
    if ((persisted = localStorage.getItem('state')) !== null) {
        state = recordTransit.fromJSON(persisted)
    } else {
        state = new State()
    }
    const epicMiddleware = createEpicMiddleware()
    const store = createStore(reducer, state, applyMiddleware(epicMiddleware, persistState))
    epicMiddleware.run(realtime.fetchRealtime)
    epicMiddleware.run(realtime.scheduleRealtime)
    return store
}

class RootElement extends React.Component {
    store: Store<State, AnyAction> = makeStore(reducer)

    componentDidMount() {
        this.store.dispatch(actions.initRealtime())
    }

    render() {
        return <Provider store={this.store}>
            <div className="pa_m">
                <ConnectedRealtimeFetchElement />
                <ConnectedDateElement />
                <ConnectedStopsElement />
                <ConnectedServicesElement />
            </div>
        </Provider>
    }
}

let root = document.createElement('div')
document.body.appendChild(root)
ReactDOM.render(<RootElement />, root)
