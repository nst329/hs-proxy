'use strict';
const fs = require('fs');
const http = require('http'), url = require('url'), net  = require('net');
const HTTP_PORT = process.argv[2] || 8080;  // internal proxy server port
const PROXY_URL = process.argv[3] || null;  // external proxy server URL
const PROXY_HOST = PROXY_URL ?  url.parse(PROXY_URL).hostname    : null;
const PROXY_PORT = PROXY_URL ? (url.parse(PROXY_URL).port || 80) : null;

var connCount = 0;

function file_read(filePath) {
    try {
	return fs.readFileSync(filePath, 'utf8');
    } catch(err) {
	console.log(err);
	return new String();
    }
};
var black_list = file_read( "./blist.txt" ).trim().split(/\r?\n/).map(function(e) { return new RegExp( e + "$" , 'i' ) } );
function black_list_check( addr ) {
    var ret = black_list.some( function(e) { return e.test(addr) ; } ) ;
    console.log("black_list_check:" + addr + " RET:" + ret);
    return ret;
}
//black_list_check( "AAA" );

var tid = setInterval(function() {
    let n = new Date() ;
    let h = n.getHours() ;
    let m = n.getMinutes() ;
    if ( h == 18 && m == 0 ) {
	setTimeout( function() {  process.exit(0); } , 1000*60 );
	clearInterval( tid );
    }
}, 1000*30 ) ;

const server = http.createServer(function onCliReq(cliReq, cliRes) {
  let svrSoc;
  const cliSoc = cliReq.socket, x = url.parse(cliReq.url);

  if(black_list_check( x.hostname )) {
      cliRes.writeHead(400, 'forbidden' , {'content-type': 'text/html'});
      cliRes.end('<h1>' + 'forbidden' + '<br/>' + cliReq.url + '</h1>');
      return ;
  }
  const svrReq = http.request({host: PROXY_HOST || x.hostname,
      port: PROXY_PORT || x.port || 80,
      path: PROXY_URL ? cliReq.url : x.path,
      method: cliReq.method, headers: cliReq.headers,
      agent: cliSoc.$agent}, function onSvrRes(svrRes) {
	  svrSoc = svrRes.socket;
	  cliRes.writeHead(svrRes.statusCode, svrRes.headers);
	  svrRes.pipe(cliRes);
//	  console.log( ' +srvsock:' + ' (' + svrRes.socket.localPort + '): ' + cliReq.url );
      });

  console.log( '+http req:' + ' (' + cliSoc.remotePort + '): ' + cliReq.url );
  cliReq.pipe(svrReq);
  svrReq.on('error', function onSvrReqErr(err) {
    cliRes.writeHead(400, err.message, {'content-type': 'text/html'});
    cliRes.end('<h1>' + err.message + '<br/>' + cliReq.url + '</h1>');
    onErr(err, 'createServer[svrReq]', x.hostname + ':' + (x.port || 80), svrSoc);
  });

  if( cliSoc.listenerCount('error') == 1 )
  {
      cliSoc.once('error',function(err) {
	  console.log('clientSocErr' + ' (' + cliSoc.remotePort + ') ' + 'http://' + cliReq.url + ' ' + err + '' );
	  console.log('serverAbort' + ' (' + svrReq.socket.localPort + ') ' + 'http://' + cliReq.url + ' ' + err + '' );
	  svrReq.abort();
      });
  }
})
.on('clientError', (err, soc) => onErr(err, 'cliErr', '' , soc))
.on('connect', function onCliConn(cliReq, cliSoc, cliHead) {
  const x = url.parse('https://' + cliReq.url);
  if(black_list_check( x.hostname )) {
      cliSoc.end();
      return ;
  }

  let svrSoc;
    svrSoc = net.connect(x.port || 443, x.hostname, function onSvrConn() {
      cliSoc.write('HTTP/1.0 200 Connection established\r\n\r\n');
      if (cliHead && cliHead.length) svrSoc.write(cliHead);
      cliSoc.pipe(svrSoc);
	console.log('++server conn:' + ' (' + cliSoc.remotePort + ') ' + 'https://' + cliReq.url );
    });
    svrSoc.on('close', function onDisconn() {
	console.log('--server conn:' + ' (' + cliSoc.remotePort + ') ' + 'https://' + cliReq.url );
    });

    svrSoc.pipe(cliSoc);
    svrSoc.on('error', err => onErr(err, 'connect[svrSoc]', cliReq.url, cliSoc));
    cliSoc.on('error', err => onErr(err, 'connect[cliSoc]', cliReq.url, svrSoc));
})
.on('connection', function onConn(cliSoc) {
  cliSoc.$agent = new http.Agent({keepAlive: true});
  cliSoc.$agent.on('error', err => console.log('agent:', err));

  cliSoc.connTime = new Date();
  console.log('++conn:' + ' (' + cliSoc.remotePort + '): ' + (++connCount) );
  cliSoc.on('close', function onDisconn() {
      console.log('--conn:' + ' (' + cliSoc.remotePort + '): ' + (--connCount)  + ' time: ' +
	    (new Date() - cliSoc.connTime) / 1000.0 + ' sec');
  });
})
.listen(HTTP_PORT, () =>
  console.log('%s http proxy server started on port ' + HTTP_PORT +
	      (PROXY_URL ? ' -> ' + PROXY_HOST + ':' + PROXY_PORT : '') , new Date().toLocaleString() ) );

function onErr(err, msg, url, soc) {
    console.log('%s %s: %s' + ' (' + soc.remotePort + '): ', new Date().toLocaleString(), msg, url, err + '');
    if (soc) {
	soc.end() ;
	soc.destroy();
    }
}
