interface EnterKeyEvent {
  readonly key: string
  readonly keyCode?: number
  readonly shiftKey: boolean
  readonly nativeEvent: { readonly isComposing?: boolean }
}

/** 输入法确认候选词期间的 Enter 只交给输入法，不触发提交。 */
export function shouldSubmitOnEnter(event: EnterKeyEvent): boolean {
  return event.key === 'Enter'
    && !event.shiftKey
    && event.nativeEvent.isComposing !== true
    && event.keyCode !== 229
}
