import * as Pbf from 'pbf'
import * as gtfsRealtime from 'gtfs-rt-bindings'
import * as moment from 'moment'

import * as caltrain from './caltrain'
import { List, Map } from '../node_modules/immutable';


fetch('https://api.511.org/transit/tripupdates?api_key=711ca03b-2281-46a2-94eb-6fc53aec0c27&agency=CT')
    .then(r => r.arrayBuffer())
    .then((b): caltrain.RealtimeUpdates => {
        let p = new Pbf(new Uint8Array(b))
        let feed = gtfsRealtime.FeedMessage.read(p)
        return Map<caltrain.TripStopKey, caltrain.RealtimeUpdate>().withMutations(ret => {
            for (let entity of feed.entity) {
                if (!('trip_update' in entity)) {
                    continue
                }
                let update = entity.trip_update
                let tripId = caltrain.isoTripId.wrap(update.trip.trip_id)
                for (let stopUpdate of update.stop_time_update) {
                    let stopId = caltrain.isoStopId.wrap(stopUpdate.stop_id)
                    let departure = moment(stopUpdate.departure.time * 1000)
                    let delay = stopUpdate.departure.delay as number
                    ret.set(new caltrain.TripStopKey({tripId, stopId}), new caltrain.RealtimeUpdate({departure, delay}))
                }
            }
        })
    })
    .then(updates => {
        console.log(updates)
    })
