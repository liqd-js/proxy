const Client = require('@liqd-js/client');
const Server = require('@liqd-js/server');
const Websocket = require('@liqd-js/websocket');
const Client_JSONRPC = require('@liqd-js/client-jsonrpc');
const request = require('@liqd-js/server/lib/request');

class ProxyServer
{
    #server; #tunnels = new Set();

    constructor( options = {})
    {
        this.#server = new Server({ port: options.port }); //TODO additional options

        this.#server.ws( '/__tunnel__', ( client ) => 
        {
            let jsonrpc_client = new Client_JSONRPC( client );

            this.#tunnels.add( jsonrpc_client );
        });

        this.#server.use( async( req, res ) =>
        {
            let tunnel = [...this.#tunnels.entries()][0];
            let body = '';
            
            req.on( 'data', chunk => body += chunk.toString() );
            req.on( 'end', async() =>
            {
                console.log({ method: req.method, url: request.url, headers: req.headers, body });

                let response = await tunnel.call( 'proxy', { method: req.method, url: request.url, headers: req.headers, body });

                headers['content-encoding'] && ( delete headers['content-encoding'] ); // TODO content encoding identity

                res.writeHead( response.statusCode, response.headers );
                res.end( response.text );
            });
        });
    }
}

class ProxyTunnel
{
    #client;

    constructor( options = {})
    {
        this.#client = new Client_JSONRPC( options.proxy );

        this.#client.on( 'call', async ( call ) => 
        {
            console.log( 'call',  call );
    
            if( call.method === 'proxy' )
            {
                let request = call.params[0];

                let response = await Client[request.method.toLowerCase()]( options.webroot + request.url, { headers: request.headers, body: request.body });

                this.#client.result( call.id, { headers: response.headers, statusCode: response.statusCode, text: await response.text });
            }
            else{  } //TODO
        });
    }
}

module.exports = class Proxy
{
    static get Server(){ return ProxyServer }
    static get Tunnel(){ return ProxyTunnel }
}