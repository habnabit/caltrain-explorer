import * as React from 'react'
import * as ReactDOM from 'react-dom'
import { onlyUpdateForKeys, pure, shallowEqual, withState } from 'recompose'
import { List } from 'immutable'

import './site.sass'
import caltrain from './caltrain'


let StopsElement = pure((props: {

}) => {
    return <div>
        {caltrain.stops.map((stop, e) => {
            return <div key={e}>{stop.stop_name}</div>
        })}
    </div>
})

function makeRootElement(): JSX.Element {
    return <>
        <StopsElement />
    </>
}

let root = document.createElement('div')
document.body.appendChild(root)
ReactDOM.render(makeRootElement(), root)
