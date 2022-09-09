const Client = require('@liqd-js/client');
const Server = require('@liqd-js/server');
const Client_JSONRPC = require('@liqd-js/client-jsonrpc');

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

            client.on( 'close', () => 
            {
                //console.log( 'disconnected' );

                this.#tunnels.delete( jsonrpc_client );
            });
        });

        this.#server.use(( req, res ) =>
        {
            this.dispatch( req, res );
        });
    }

    async dispatch( req, res )
    {
        let body = '';
                    
        req.on( 'data', chunk => body += chunk.toString() );
        req.on( 'end', () =>
        {
            //console.log({ method: req.method, url: req.url, headers: req.headers, body });

            const call = async() =>
            {
                let tunnel = [...this.#tunnels.values()][0];

                if( tunnel )
                {
                    let { result } = await tunnel.call( 'proxy', { method: req.method, url: req.url, headers: { ...req.headers, 'x-tunneled-request': 'true' }, body });

                    //console.log( 'RESULT', result );

                    result.headers?.['content-encoding'] && ( delete result.headers['content-encoding'] ); // TODO content encoding identity

                    res.writeHead( result.statusCode, result.headers );
                    res.end( result.text );
                }
                else
                {
                    ///console.log( 'Retryiing' );

                    setTimeout( call, 1000 ); // TODO max timeout
                }
            }

            call();
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
            //console.log( 'call',  call );
    
            if( call.method === 'proxy' )
            {
                let request = call.params[0];

                let response = await Client[request.method.toLowerCase()]( options.webroot + request.url, { headers: request.headers, body: request.body });

                //console.log( 'RESPONSE', { headers: response.headers, statusCode: response.statusCode, text: await response.text });

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