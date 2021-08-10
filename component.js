/* globals m */

export default function Component({ attrs: { proxy, z }}){
	
	let subscription;
	
	// todo-james ask barney if this can be a text node instead
	function view(){ return m('span.z') }
	function oncreate({ dom }){
		subscription = z.on('change', [proxy], value => {
			m.render(dom, value)
		})
		m.render(dom, proxy.$.state)
	}

	function onremove(){
		z.off('change', [proxy], subscription)
	}
	
	return { view, oncreate, onremove }
}
