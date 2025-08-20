const http = require('http');
const fs = require('fs');
const path = require('path');
const WebSocket = require('ws');

const PORT = 8080;

const server = http.createServer((req,res)=>{
    let filePath = '.' + req.url;
    if(filePath=='./') filePath='./index.html';
    const extname = String(path.extname(filePath)).toLowerCase();
    const mimeTypes = {
        '.html':'text/html',
        '.js':'text/javascript',
        '.css':'text/css',
    };
    const contentType = mimeTypes[extname] || 'application/octet-stream';
    fs.readFile(filePath,(err,content)=>{
        if(err){
            res.writeHead(404);
            res.end('Not found');
        }else{
            res.writeHead(200,{ 'Content-Type': contentType });
            res.end(content,'utf-8');
        }
    });
});

server.listen(PORT,()=>console.log(`Server running on port ${PORT}`));

const wss = new WebSocket.Server({ server });

const rooms={};

wss.on('connection', ws => {
    ws.roomId=null;
    ws.username=null;

    ws.on('message', message=>{
        try{
            const data = JSON.parse(message);

            // join room
            if(data.type==='join'){
                const roomId=data.room;
                const username=data.username;
                ws.roomId=roomId;
                ws.username=username;

                if(!rooms[roomId]) rooms[roomId]={users:{}};
                const room = rooms[roomId];
                if(Object.keys(room.users).length>=5){
                    ws.send(JSON.stringify({type:'full'}));
                    return;
                }
                room.users[ws._socket.remoteAddress+'_'+Math.random()]=username;


                const roster = Object.values(room.users);
                Object.keys(room.users).forEach(uKey=>{
                    wss.clients.forEach(c=>{
                        if(c.readyState===WebSocket.OPEN && c.roomId===roomId){
                            c.send(JSON.stringify({type:'roster',users:roster}));
                        }
                    });
                });

                // notify join
                Object.keys(room.users).forEach(uKey=>{
                    wss.clients.forEach(c=>{
                        if(c.readyState===WebSocket.OPEN && c.roomId===roomId){
                            c.send(JSON.stringify({type:'join',user:username}));
                        }
                    });
                });
            }

            // message broadcast
            if(data.type==='message'){
                const room = rooms[ws.roomId];
                if(!room) return;
                Object.keys(room.users).forEach(uKey=>{
                    wss.clients.forEach(c=>{
                        if(c.readyState===WebSocket.OPEN && c.roomId===ws.roomId){
                            c.send(JSON.stringify({type:'message',user:ws.username,text:data.text}));
                        }
                    });
                });
            }


            if(data.type==='rename'){
                const oldName=ws.username;
                ws.username=data.newName;
                const room = rooms[ws.roomId];
                if(!room) return;
                Object.keys(room.users).forEach(uKey=>{
                    if(room.users[uKey]===oldName) room.users[uKey]=ws.username;
                });
                Object.keys(room.users).forEach(uKey=>{
                    wss.clients.forEach(c=>{
                        if(c.readyState===WebSocket.OPEN && c.roomId===ws.roomId){
                            c.send(JSON.stringify({type:'rename',oldName,newName:ws.username}));
                            const roster = Object.values(room.users);
                            c.send(JSON.stringify({type:'roster',users:roster}));
                        }
                    });
                });
            }

        }catch(e){console.error(e);}
    });

    ws.on('close',()=>{
        const room = rooms[ws.roomId];
        if(!room) return;
        const oldName = ws.username;
        Object.keys(room.users).forEach(uKey=>{
            if(room.users[uKey]===ws.username) delete room.users[uKey];
        });
        Object.keys(room.users).forEach(uKey=>{
            wss.clients.forEach(c=>{
                if(c.readyState===WebSocket.OPEN && c.roomId===ws.roomId){
                    c.send(JSON.stringify({type:'leave',user:oldName}));
                    const roster = Object.values(room.users);
                    c.send(JSON.stringify({type:'roster',users:roster}));
                }
            });
        });
        if(Object.keys(room.users).length===0) delete rooms[ws.roomId];
    });
});
