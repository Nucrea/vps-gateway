import http from 'http';
import express, { Router } from 'express';
import RequestId from 'express-request-id';
import { createProxyMiddleware  } from 'http-proxy-middleware';

import { register, Counter, Gauge, collectDefaultMetrics } from 'prom-client';


const GATEWAY_PORT = 4000;
const METRICS_PORT = 4001;
const BITWARDEN_PORT = 4002;
const TBOT_DIR = '/home/sergey/apps/tbot-app';

const GRAFANA_KEY = 'eyJrIjoieWFPZnFGMVdiMDVEek5HNXlIUTlIZVI0WFA5VUNnUUIiLCJuIjoiYWRtaW4iLCJpZCI6MX0=';


// const exceptionsCounterMetric = new Counter({
//     name: 'gateway_active_connections',
//     help: 'Example of a counter',
//     labelNames: ['code'],
// });

const requestsActiveMetric = new Gauge({
    name: 'gateway_connections_active',
    help: 'Example of a gauge',
    labelNames: ['connections'],
});


async function start() {
    const app = express();
    app.use(RequestId());
    app.use((req, res, next) => {
        console.log(`Request: ${req.headers.host},  ${req.url}`);
        next();
    })

    app.use('/tbot', express.static(TBOT_DIR));

    app.use('/tbot-api/**', (req, res) => { res.sendStatus(501); });

    app.use('/bitwarden/**', createProxyMiddleware({ 
        target: 'http://localhost:4002',
        changeOrigin: false,
    }));

    app.use('/bitwarden', (req, res) => { res.redirect('/bitwarden/'); });

    app.use('/grafana', createProxyMiddleware({ 
        target: 'http://localhost:3000',
        changeOrigin: false,
        onProxyReq: (proxyReq, req, res) => {
            // proxyReq.setHeader('authorization', `Bearer ${GRAFANA_KEY}`);
        }
    }));

    app.use('/prometheus', createProxyMiddleware({ 
        target: 'http://localhost:9090',
        changeOrigin: true,
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

    const server = http.createServer(app).listen(GATEWAY_PORT);
    console.log(`Gateway server listening to ${GATEWAY_PORT}`);

    setInterval(() => {
        server.getConnections(function(err, count) {
            requestsActiveMetric.set(count);
         });
    }, 1000);

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

async function startMetrics() {
    // collectDefaultMetrics({
    //     gcDurationBuckets: [0.001, 0.01, 0.1, 1, 2, 5], // These are the default buckets.
    // });
    
    // Setup server to Prometheus scrapes:
    const app = express();

    // app.get('/metrics/counter', async (req, res) => {
    //     try {
    //         res.set('Content-Type', register.contentType);
    //         res.end(await register.getSingleMetricAsString('test_counter'));
    //     } catch (ex) {
    //         res.status(500).end(ex);
    //     }
    // });
    
    app.listen(METRICS_PORT, () => 
        console.log(`Metrics server listening to ${METRICS_PORT}, metrics exposed on /metrics endpoint`));
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