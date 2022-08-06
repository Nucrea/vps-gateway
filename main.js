import http from 'http';
import express, { Router } from 'express';
import RequestId from 'express-request-id';
import { createProxyMiddleware  } from 'http-proxy-middleware';

import { register, Gauge, collectDefaultMetrics } from 'prom-client';


const GATEWAY_PORT = 4000;
const METRICS_PORT = 4001;
const BITWARDEN_PORT = 4002;
const TBOT_DIR = '/home/sergey/apps/tbot-app';

const GRAFANA_KEY = 'eyJrIjoieWFPZnFGMVdiMDVEek5HNXlIUTlIZVI0WFA5VUNnUUIiLCJuIjoiYWRtaW4iLCJpZCI6MX0=';


const requestsActiveMetric = new Gauge({
    name: 'gateway_connections_active',
    help: 'Example of a gauge',
    labelNames: ['connections'],
});


async function start() {
    const app = express();
    const server = http.createServer(app);

    app.use(RequestId());
    app.use((req, res, next) => {
        console.log(`Request: ${req.headers.host},  ${req.url}`);
        next();
    })

    setupBitwarden(app);
    setupTelegram(app);
    setupMetrics(app, server);

    server.listen(GATEWAY_PORT);
    console.log(`Gateway server listening to ${GATEWAY_PORT}`);

    // app.listen(GATEWAY_PORT, () => 
    //     console.log(`Gateway server listening to ${GATEWAY_PORT}`));

    // app.use('*', (req, res) => { res.send('<p>keks!</p>'); });

    // http.createServer((req, res) => {
    //     console.log(`Request: ${req.headers.host},  ${req.url}`);
    //     switch(req.headers.host) {
    //         case 'nucrea.online':
    //         case 'www.nucrea.online':
    //             app(req, res);
    //             break;
    //         // case 'tbot.nucrea.online':
    //         // case 'www.tbot.nucrea.online':
    //         //     appTbot(req, res);
    //         //     break;
    //         default:
    //             // res.sendStatus(504);
    //             res.
    //     }
    // }).listen(GATEWAY_PORT);
}


function setupTelegram(app) {
    app.use('/tbot', express.static(TBOT_DIR));

    app.use('/tbot-api/**', (req, res) => { res.sendStatus(501); });
}


function setupBitwarden(app) {
    app.use(createProxyMiddleware('/bitwarden/notifications/hub/**', { 
        target: 'http://localhost:4002',
        changeOrigin: false,
    }));

    app.use(createProxyMiddleware('/bitwarden/notifications/hub', { 
        target: 'ws://localhost:3012',
        changeOrigin: false,
        ws: true,
    }));

    app.use('/bitwarden/**', createProxyMiddleware({ 
        target: 'http://localhost:4002',
        changeOrigin: false,
    }));

    app.use('/bitwarden', (req, res) => { res.redirect('/bitwarden/'); });
}


function setupMetrics(app, server) {
    app.use(createProxyMiddleware('/grafana', { 
        target: 'http://localhost:3000',
        changeOrigin: false,
        ws: true,
        logLevel : 'debug',
        onProxyReq: (proxyReq, req, res) => {
            // proxyReq.setHeader('authorization', `Bearer ${GRAFANA_KEY}`);
        }
    }));

    app.use(createProxyMiddleware('/prometheus', { 
        target: 'http://localhost:9090',
        changeOrigin: false,
        pathRewrite: {'^/prometheus' : ''},
    }));

    app.get('/metrics', async (req, res) => {
        try {
            res.set('Content-Type', register.contentType);
            res.end(await register.metrics());
        } catch (ex) {
            res.status(500).end(ex);
        }
    });

    setInterval(() => {
        server.getConnections(function(err, count) {
            requestsActiveMetric.set(count ?? 0);
         });
    }, 1000);
}


(async () => {
    try {
        process.on('unhandledRejection', () => {
            console.error(e.message);
        });
        process.on('uncaughtException', (e) => {
            console.error(e.message);
        });
        await start();
    } catch(e) {
        console.error(e);
    }
})();