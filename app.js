/* globals m,window,document */
import Z from './z.js'

let z = new Z()
let h = z.hyperscript

window.z = z

function App(){
  
  let state = z.state
  state.a = 1
  function view(){
    return h('.app', 'hey', state.a)
  }
  
  return { view }
}

let state = z.state
state.a = 1

m.mount(document.body, App)