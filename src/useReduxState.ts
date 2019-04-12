import { useContext, useReducer, useRef, useEffect, useMemo, useLayoutEffect } from 'react'
import { ReactReduxContext } from 'react-redux'
import shallowEqual from './shallowEqual'

// React currently throws a warning when using useLayoutEffect on the server.
// To get around it, we can conditionally useEffect on the server (no-op) and
// useLayoutEffect in the browser. We need useLayoutEffect to ensure the store
// subscription callback always has the selector from the latest render commit
// available, otherwise a store update may happen between render and commit,
// which may cause missed updates
const useIsomorphicLayoutEffect =
  typeof window !== 'undefined' ? useLayoutEffect : useEffect

/**
 * A hook to access the redux state from a component.
 *
 * Usage:
 *
```jsx
import React from 'react'
import { useReduxState } from '@mrwolfz/react-redux-hooks-poc'

export const ExampleComponent = ({ id }) => {
  const item = useReduxState(state => state.items[id])
  return <div>{item.label}</div>
}
```
 */
export function useReduxState<TState, TSlice = TState>(selector?: (state: TState) => TSlice): TSlice {
  const safeSelector = selector || (s => s as any as TSlice)

  const { store, subscription: contextSub } = useContext(ReactReduxContext)
  const [, forceRender] = useReducer(s => s + 1, 0)

  const subscription = useMemo(() => new contextSub.constructor(store, contextSub), [
    store,
    contextSub
  ])

  const latestSelector = useRef(safeSelector)
  const selectedState = safeSelector(store.getState())
  const latestSelectedState = useRef(selectedState)

  useIsomorphicLayoutEffect(() => {
    latestSelector.current = safeSelector
    latestSelectedState.current = selectedState
  })

  useEffect(() => {
    let didUnsubscribe = false

    function checkForUpdates() {
      if (didUnsubscribe) {
        return
      }

      try {
        const newSelectedState = latestSelector.current(store.getState())

        if (shallowEqual(newSelectedState, latestSelectedState.current)) {
          return
        }

        latestSelectedState.current = newSelectedState
      } catch {
        // we ignore all errors here, since when the component
        // is re-rendered, the selector is called again, and
        // will throw again, if neither props nor store state
        // changed
      }

      forceRender({})
    }

    subscription.onStateChange = checkForUpdates
    subscription.trySubscribe()

    checkForUpdates()

    const unsubscribeWrapper = () => {
      didUnsubscribe = true
      subscription.tryUnsubscribe()
    }

    return unsubscribeWrapper
  }, [store, subscription])

  return selectedState
}
