# Middleware

> 🚨 This isn't implemented, this is an idea.  If we did it, I would want it to be an optional thing and not a core assumption.
> I would also want the benefits to justify veering away from "standards".  E.g. request aggregation, dev tools, etc
>
> A key reason I really want this, is not just cancellation, but it would very well with client side composable SQL fragments.
> By default SQL fragments are just objects with escaped text and values, but when yielded, they execute.  That is a compelling enough UX to justify the feature I think.

Middleware allows your transactions to completely yield control to Zed for execution.  This is beneficial as requests can be individually tracked, cached and cancelled in sequence and harmony with Zed's transaction execution flow.

This is completely optional, as ZX transactions supports native promise returning functions.  But the benefit of modelling effects as data is often greater performance, less data transfer, better and faster end to end testing and lower memory overhead.

```js
z.use(function * (payload){
    if( payload.type != 'z.fetch' ) return;

    if ( payload.tag == 'invoke' ) {
        yield payload.value()
    } else if( payload.tag == 'fetch' ) {

        let controller = new AbortController();
    
        try {
            let realResponse = 
                yield fetch(payload.value.url, { ...payload.value.options, signal: controller.signal })
    
            // todo-james generate dynamically
            const response = {
                body(){
                    return { type: 'z.fetch', tag: 'invoke', value: () => realResponse.body() }
                }, 
                blob(){
                    return { type: 'z.fetch', tag: 'invoke', value: () => realResponse.blob() }
                }, 
                clone(){
                    return { type: 'z.fetch', tag: 'invoke', value: () => realResponse.clone() }
                }, 
                formData(){
                    return { type: 'z.fetch', tag: 'invoke', value: () => realResponse.formData() }
                }, 
                json(){
                    return { type: 'z.fetch', tag: 'invoke', value: () => realResponse.json() }
                }, 
                redirect(){
                    return { type: 'z.fetch', tag: 'invoke', value: () => realResponse.redirect() }
                }, 
                text(){
                    return { type: 'z.fetch', tag: 'invoke', value: () => realResponse.text() }
                }, 
                get url(){
                    return realResponse.url
                },
                get type(){
                    return realResponse.type
                },
                get statusText(){
                    return realResponse.statusText
                },
                get status(){
                    return realResponse.status
                },
                get redirected(){
                    return realResponse.redirected
                },
                get ok(){
                    return realResponse.ok
                },
                get bodyUsed(){
                    return realResponse.bodyUsed
                },
                headers: realResponse.headers
            }
        } catch {
            // this catch may be triggered externally
            // via it.throw()
            controller.abort()
        }
    }
})

z.fetch = (url, options={}) => {
    return { type: 'z.fetch', tag: 'fetch', value: { url, options } }
}

```