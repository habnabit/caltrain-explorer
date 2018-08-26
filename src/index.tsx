import * as React from 'react'
import * as ReactDOM from 'react-dom'
import { Provider, connect } from 'react-redux'
import { onlyUpdateForKeys } from 'recompose'
import { createStore, DeepPartial, Reducer, Store, Dispatch, bindActionCreators, AnyAction, applyMiddleware } from 'redux'
import { createEpicMiddleware } from 'redux-observable'
import { List, Record, Set, OrderedSet, Map, Seq } from 'immutable'
import * as moment from 'moment'
import { isMoment } from 'moment'
import { ActionType, getType } from 'typesafe-actions'

import './site.sass'
import * as actions from './actions'
import * as caltrain from './caltrain'
import * as realtime from './realtime'


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
    return <div className="flex gap-no read_xl justify-between">
        {props.zoneStops.entrySeq().map(([zone, stops], i) => <div key={i} className="span-auto flex gap-no read_xl ma-t_s">
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
    ['selection', 'show', 'trip', 'stops', 'date', 'realtimeUpdates']
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
    return <tr>
        <td>{props.trip.shortName}</td>
        {stops.map(([s, ts], e) => {
            let cell
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
                    let stopDate = ts.departureFor(props.date)
                    cell = stopDate.format('HH:mm')
                    if (firstDeparture !== undefined && !stopDate.isSame(firstDeparture)) {
                        cell = <>{cell} ({stopDate.diff(firstDeparture, 'minutes')}m)</>
                    }
                    if (realtime !== undefined) {
                        cell = <>{cell} {realtime.toJS()}</>
                    }
                }
            } else {
                cell = '⋯'
            }
            return <td key={e} className={'text-center ' + (props.selection.referenceStop == s.name? 'reference-col' : '')} onClick={() => props.onSelectReference({stop: s.name})}>{cell}</td>
        })}
    </tr>
})

let TripsElement = onlyUpdateForKeys(
    ['direction', 'selection', 'trips', 'date', 'realtimeUpdates']
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
    return <table className="table bo-no fixed dense">
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
}) {
    dateMoment(): moment.Moment {
        switch (this.date) {
        case 'today': return moment()
        case 'tomorrow': return moment().add(1, 'day').startOf('day')
        default: return this.date.startOf('day')
        }
    }

    withRealtimeUpdates(updates: List<realtime.RealtimeUpdate>): this {
        let alerts = [] as realtime.ServiceAlert[]
        return this.update('tripUpdates', u => u.withMutations(tripUpdates => {
            for (let update of updates) {
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
        })).set('alerts', List(alerts))
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

    recheckingStops(updater: (state: State) => State): State {
        let updated = updater(this)
        if (this.date === updated.date) {
            return updated
        }
        let zoneStops = updated.zoneStopsFor()
        if (this.zoneStops.equals(zoneStops)) {
            return updated
        }
        return updated
            .set('zoneStops', zoneStops)
            .update('selection', sel => sel.recheckingZoneStops(zoneStops))
    }
}

type AllActions = ActionType<typeof actions>

function reducer(state = new State(), action: AllActions): State {
    if (state.zoneStops.size == 0) {
        state = state.set('zoneStops', state.zoneStopsFor())
    }

    switch (action.type) {
    case getType(actions.toggleStopSelection): {
        let { stop } = action.payload
        return state.update('selection', s => s.toggleChecked(stop))
    }

    case getType(actions.selectReferenceStop): {
        let { stop } = action.payload
        return state.update('selection', s => s.set('referenceStop', stop))
    }

    case getType(actions.setDate): {
        let { date } = action.payload
        return state.recheckingStops(s => s.set('date', date))
    }

    case getType(actions.fetchRealtime.success): {
        let { updates } = action.payload
        return state.withRealtimeUpdates(updates)
    }

    default: {
        return state
    }
    }
}

function makeStore<S>(reducer: Reducer<S>, state: DeepPartial<S>): Store<S> {
    const epicMiddleware = createEpicMiddleware()
    const store = createStore(reducer, state, applyMiddleware(epicMiddleware))
    //epicMiddleware.run(realtime.fetchRealtime)
    return store
}

class RootElement extends React.Component {
    store: Store<State, AnyAction> = makeStore(reducer, new State())

    componentDidMount() {
        this.store.dispatch(actions.fetchRealtime.request())
    }

    render() {
        return <Provider store={this.store}>
            <div className="pa_m">
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
