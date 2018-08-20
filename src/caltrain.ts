import { List, Map, Record, Seq, Set } from 'immutable'
import { iso, Newtype } from 'newtype-ts'
import * as moment from 'moment'
const toposort: <T>(edges: [T, T][]) => T[] = require('toposort')


type CaltrainData = Readonly<{
    agency: {
        agency_fare_url: string,
        agency_id: string,
        agency_lang: string,
        agency_name: string,
        agency_phone: string,
        agency_timezone: string,
        agency_url: string
    }[],
    calendar: {
        end_date: string,
        friday: string,
        monday: string,
        saturday: string,
        service_id: string,
        start_date: string,
        sunday: string,
        thursday: string,
        tuesday: string,
        wednesday: string
    }[],
    calendar_attributes: {
        service_description: string,
        service_id: string
    }[],
    calendar_dates: {
        date: string,
        exception_type: string,
        service_id: string
    }[],
    directions: {
        direction: string,
        direction_id: string,
        route_id: string
    }[],
    fare_attributes: {
        currency_type: string,
        fare_id: string,
        payment_method: string,
        price: string,
        transfer_duration: string,
        transfers: string
    }[],
    fare_rules: {
        destination_id: string,
        fare_id: string,
        origin_id: string,
        route_id: string
    }[],
    farezone_attributes: {
        zone_id: string,
        zone_name: string
    }[],
    realtime_routes: {
        realtime_enabled: string,
        realtime_routecode: string,
        realtime_routename: string,
        route_id: string
    }[],
    routes: {
        agency_id: string,
        route_color: string,
        route_desc: string,
        route_id: string,
        route_long_name: string,
        route_short_name: string,
        route_text_color: string,
        route_type: string,
        route_url: string
    }[],
    stop_attributes: {
        accessibility_id: string,
        cardinal_direction: string,
        relative_position: string,
        stop_city: string,
        stop_id: string
    }[],
    stop_times: {
        arrival_time: string,
        departure_time: string,
        drop_off_type: string,
        pickup_type: string,
        shape_dist_traveled: string,
        stop_headsign: string,
        stop_id: string,
        stop_sequence: string,
        timepoint: string,
        trip_id: string
    }[],
    stops: {
        location_type: string,
        parent_station: string,
        stop_code: string,
        stop_desc: string,
        stop_id: string,
        stop_lat: string,
        stop_lon: string,
        stop_name: string,
        stop_timezone: string,
        stop_url: string,
        wheelchair_boarding: string,
        zone_id: string
    }[],
    trips: {
        bikes_allowed: string,
        block_id: string,
        direction_id: string,
        route_id: string,
        service_id: string,
        shape_id: string,
        trip_headsign: string,
        trip_id: string,
        trip_short_name: string,
        wheelchair_accessible: string
    }[],
}>

interface RawData {
    [key: string]: string[][]
}

const rawData: RawData = require('./ct-gtfs.json')
export const caltrain = Seq(rawData)
    .map(vl => {
        let vseq = Seq(vl)
        let keys = Seq(vseq.first())
        new Object()
        return vseq.slice(1)
            .map(cells => Seq.Keyed(keys.zip(Seq(cells))).toObject())
            .toArray()
    })
    .toObject() as CaltrainData

export interface ZoneId extends Newtype<{ readonly ZoneId: unique symbol }, string> {}
export const isoZoneId = iso<ZoneId>()

export class FareZone extends Record({
    id: undefined as ZoneId,
    name: '',
}) {
}

export const fareZones: Map<ZoneId, FareZone> = Seq(caltrain.farezone_attributes)
    .toKeyedSeq()
    .mapEntries(([_e, {zone_id, zone_name}]) => {
        let id = isoZoneId.wrap(zone_id)
        return [id, new FareZone({id, name: zone_name})] as [ZoneId, FareZone]
    })
    .toMap()

export interface StopId extends Newtype<{ readonly StopId: unique symbol }, string> {}
export const isoStopId = iso<StopId>()

export class Stop extends Record({
    id: undefined as StopId,
    zone: undefined as FareZone,
    code: '',
    desc: '',
    name: '',
    url: '',
}) {
}

export const stops: Map<StopId, Stop> = Seq(caltrain.stops)
    .toKeyedSeq()
    .mapEntries(([_e, stop]) => {
        let id = isoStopId.wrap(stop.stop_id)
        let zone = fareZones.get(isoZoneId.wrap(stop.zone_id))
        return [id, new Stop({
            id, zone,
            code: stop.stop_code,
            desc: stop.stop_desc,
            name: stop.stop_name.replace(' Caltrain', ''),
            url: stop.stop_url,
        })] as [StopId, Stop]
    })
    .toMap()

export interface RouteId extends Newtype<{ readonly RouteId: unique symbol }, string> {}
export const isoRouteId = iso<RouteId>()

export class Route extends Record({
    id: undefined as RouteId,
    desc: '',
    longName: '',
    shortName: '',
    url: '',
}) {
}

export const routes: Map<RouteId, Route> = Seq(caltrain.routes)
    .toKeyedSeq()
    .mapEntries(([_e, route]) => {
        let id = isoRouteId.wrap(route.route_id)
        return [id, new Route({
            id,
            desc: route.route_desc,
            longName: route.route_long_name,
            shortName: route.route_short_name,
            url: route.route_url,
        })] as [RouteId, Route]
    })
    .toMap()

export interface ServiceId extends Newtype<{ readonly ServiceId: unique symbol }, string> {}
export const isoServiceId = iso<ServiceId>()

export type Direction = 'North' | 'South'
export class DirectionKey extends Record({
    routeId: undefined as RouteId,
    directionId: '',
}) {}

const directions: Map<DirectionKey, Direction> = Seq(caltrain.directions)
    .toKeyedSeq()
    .mapEntries(([_e, d]) =>
        [new DirectionKey({
            routeId: isoRouteId.wrap(d.route_id),
            directionId: d.direction_id,
        }), d.direction as Direction])
    .toMap()

export interface TripId extends Newtype<{ readonly TripId: unique symbol }, string> {}
export const isoTripId = iso<TripId>()

export type AlignedStop = TripStop | 'skipped' | 'never'
export type AlignedStops = List<[Stop, AlignedStop]>

export class Trip extends Record({
    id: undefined as TripId,
    route: undefined as Route,
    serviceId: undefined as ServiceId,
    direction: undefined as Direction,
    headsign: '',
    shortName: '',
}) {
    stopsAlignedTo(stops: List<Stop>): AlignedStops {
        let byIdEntries = tripStops.get(this.id)
            .valueSeq()
            .map(ts => [ts.stop.id, ts] as [StopId, TripStop])
            .toList()
        let byId = Map(byIdEntries)
        let firstStop = byIdEntries.first()[0]
        let lastStop = byIdEntries.last()[0]
        let seenFirst = false, seenLast = false
        return List<[Stop, AlignedStop]>().withMutations(ret => {
            stops.forEach(s => {
                let stop = byId.get(s.id)
                if (!seenFirst && stop && s.id == firstStop) {
                    seenFirst = true
                } else if (!seenLast && stop && s.id == lastStop) {
                    seenLast = true
                }
                if (stop) {
                    ret.push([s, stop])
                } else if (!seenFirst || seenLast) {
                    ret.push([s, 'never'])
                } else {
                    ret.push([s, 'skipped'])
                }
            })
        })
    }
}

export const trips: Map<TripId, Trip> = Seq(caltrain.trips)
    .toKeyedSeq()
    .mapEntries(([_e, trip]) => {
        let id = isoTripId.wrap(trip.trip_id)
        let route = routes.get(isoRouteId.wrap(trip.route_id))
        let directionKey = new DirectionKey({
            routeId: route.id,
            directionId: trip.direction_id,
        })
        return [id, new Trip({
            id, route,
            direction: directions.get(directionKey),
            serviceId: isoServiceId.wrap(trip.service_id),
            headsign: trip.trip_headsign,
            shortName: trip.trip_short_name,
        })] as [TripId, Trip]
    })
    .toMap()

export class TripStop extends Record({
    trip: undefined as Trip,
    stop: undefined as Stop,
    arrival: '',
    departure: '',
    sequence: NaN,
    timepoint: '',
}) {
}

export const tripStops: Map<TripId, List<TripStop>> = Seq(caltrain.stop_times)
    .map(s => {
        return new TripStop({
            trip: trips.get(isoTripId.wrap(s.trip_id)),
            stop: stops.get(isoStopId.wrap(s.stop_id)),
            arrival: s.arrival_time,
            departure: s.departure_time,
            sequence: parseInt(s.stop_sequence),
            timepoint: s.timepoint,
        })
    })
    .groupBy(s => s.trip.id)
    .map(stops => stops
        .valueSeq()
        .sortBy(s => s.sequence)
        .toList())
    .toMap()

export class ServiceStopKey extends Record({
    serviceId: undefined as ServiceId,
    direction: '' as Direction,
}) {}
export const serviceStops: Map<ServiceStopKey, List<Stop>> = tripStops
    .entrySeq()
    .map(([tripId, stops]) => {
        let trip = trips.get(tripId)
        let deps: [StopId, StopId][] = []
        stops.forEach((stop1, e) => {
            if (e == 0) {
                return
            }
            let stop2 = stops.get(e - 1)
            deps.push([stop1.stop.id, stop2.stop.id])
        })
        return [new ServiceStopKey(trip), deps] as [ServiceStopKey, [StopId, StopId][]]
    })
    .groupBy(([key, _stops]) => key)
    .map(collected => {
        let allDeps = collected.valueSeq()
            .flatMap(([_key, stops]) => stops)
            .filter(([s1, s2]) => isoStopId.unwrap(s1).length == 5 && isoStopId.unwrap(s2).length == 5)
            .toArray()
        let sorted = Seq(toposort(allDeps))
        return sorted
            .reverse()
            .map(stopId => stops.get(stopId))
            .toList()
    })
    .toMap()

export const tripsByService: Map<ServiceStopKey, List<Trip>> = trips
    .valueSeq()
    .groupBy(t => new ServiceStopKey(t))
    .map(collected => collected.valueSeq().toList())
    .toMap()

export const serviceStopKeysByStopName: Map<string, Set<ServiceStopKey>> = serviceStops
    .entrySeq()
    .flatMap(([key, stops]) => stops.map(stop => [stop.name, key] as [string, ServiceStopKey]))
    .groupBy(([name, _key]) => name)
    .map(collected => collected.valueSeq().map(([_name, key]) => key).toSet())
    .toMap()

const calendarKey: ('monday' | 'tuesday' | 'wednesday' | 'thursday' | 'friday' | 'saturday' | 'sunday')[] = [
    'sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday']

export function servicesFor(when: moment.Moment = moment()): Set<ServiceId> {
    let whenString = when.format('YYYYMMDD')
    let exception = Seq(caltrain.calendar_dates)
        .find(d => d.date == whenString)
    if (exception) {
        return Set([isoServiceId.wrap(exception.service_id)])
    }
    return Seq(caltrain.calendar)
        .filter(d => {
            return (
                whenString >= d.start_date
                && whenString < d.end_date
                && d[calendarKey[when.day()]] == '1'
            )
        })
        .map(d => isoServiceId.wrap(d.service_id))
        .toSet()
}
