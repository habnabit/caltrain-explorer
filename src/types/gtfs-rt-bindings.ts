declare module 'gtfs-rt-bindings' {
    import Pbf = require('pbf')

    export class FeedMessage {
        static read(p: Pbf): any
    }

    export class Alert {
        static Cause: {}
        static Effect: {}
    }
}
