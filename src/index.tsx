import * as React from 'react'
import * as ReactDOM from 'react-dom'
import { Provider, connect } from 'react-redux'
import { onlyUpdateForKeys } from 'recompose'
import { createStore, DeepPartial, Reducer, Store, Dispatch, bindActionCreators } from 'redux'
import { List, Record, Set, OrderedSet } from 'immutable'
import * as moment from 'moment'
import { isMoment } from 'moment'
import { ActionType, getType } from 'typesafe-actions'

import './site.sass'
import * as actions from './actions'
import * as caltrain from './caltrain'


(function() {
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('service-worker.js')
    }
})()


function momentsAndOrEqual<T>(a: T, b: T): boolean {
    return (isMoment(a) && isMoment(b) && a.isSame(b)) || a == b
}

let StopsElement = onlyUpdateForKeys(
    ['selection']
)((props: {
    selection: Selection
    onToggle: typeof actions.toggleStopSelection
}) => {
    return <div className="flex gap-no read_xl">
        {caltrain.serviceStopKeysByStopName.keySeq().sort().map((name, e) => {
            return <label key={e} className="box">
                <input className="checkbox" type="checkbox" checked={props.selection.checkedStops.has(name)} onChange={() => props.onToggle({stop: name})} /> {name}
            </label>
        })}
    </div>
})

const ConnectedStopsElement = connect(
    (top: State) => {
        let { selection } = top
        return { selection }
    },
    (d: Dispatch) => bindActionCreators({
        onToggle: actions.toggleStopSelection,
    }, d),
    undefined,
    {
        areStatesEqual: (x, y) => x.selection === y.selection,
        areStatePropsEqual: (x, y) => x.selection === y.selection,
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
    ['selection', 'show', 'trip', 'stops']
)((props: {
    selection: Selection
    show: Set<caltrain.StopName>
    trip: caltrain.Trip
    stops: caltrain.AlignedStops
    date: moment.Moment
    onSelectReference: typeof actions.selectReferenceStop
}) => {
    let stops = props.stops.filter(([s, _ts]) => props.show.has(s.name))
    if (!stops.some(([_s, ts]) => ts != 'never' && ts != 'skipped')) {
        return <></>
    }
    let firstArrival = stops
        .valueSeq()
        .flatMap(([s, ts]) => s.name == props.selection.referenceStop && ts instanceof caltrain.TripStop? [ts.arrivalFor(props.date)] : [])
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
                    let stopDate = ts.arrivalFor(props.date)
                    cell = stopDate.format('HH:mm')
                    if (firstArrival !== undefined && !stopDate.isSame(firstArrival)) {
                        cell = <>{cell} ({stopDate.diff(firstArrival, 'minutes')}m)</>
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
    ['direction', 'selection', 'trips']
)((props: {
    direction: caltrain.Direction
    selection: Selection
    trips: List<caltrain.Trip>
    date: moment.Moment
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
    undefined,
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

export class State extends Record({
    selection: new Selection(),
    date: 'today' as ShowDate,
}) {
    dateMoment(): moment.Moment {
        switch (this.date) {
        case 'today': return moment()
        case 'tomorrow': return moment().add(1, 'day').startOf('day')
        default: return this.date.startOf('day')
        }
    }
}

type AllActions = ActionType<typeof actions>

function reducer(state = new State(), action: AllActions): State {
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
        return state.set('date', date)
    }

    default: {
        return state
    }
    }
}

function makeStore<S>(reducer: Reducer<S>, state: DeepPartial<S>): Store<S> {
    const store = createStore(reducer, state)
    return store
}

function makeRootElement(): JSX.Element {
    let store = makeStore(reducer, new State())
    return <Provider store={store}>
        <div className="pa_m">
            <ConnectedStopsElement />
            <ConnectedDateElement />
            <ConnectedServicesElement />
        </div>
    </Provider>
}

let root = document.createElement('div')
document.body.appendChild(root)
ReactDOM.render(makeRootElement(), root)
