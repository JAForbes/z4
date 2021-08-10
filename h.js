/* globals m */
import Component from './component.js'

export default function Hyperscript(z){
    return function h(tag, attrs={}, children=[], ...rest){
        if (Array.isArray(children) ) {
          children = [...children, ...rest]  
        } else {
          children = [children, ...rest]
        }
        
        if( attrs.tag != null ) {
          children = [ attrs, ...children ]
          attrs = {}
        }
        
        for( let i =0; i< children.length; i++ ) {
          let child = children[i]
          if ( !child) continue;
          if (child['$type'] == 'z4/proxy') {
            children[i] = 
              h( Component, { key: child.$.path.key, proxy: child, z })
          }
        }
       
        return m(tag, attrs, children)
    }
}