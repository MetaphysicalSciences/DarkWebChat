const express=require('express');
const http=require('http');
const {Server}=require('socket.io');
const helmet=require('helmet');
const sanitizeHtml=require('sanitize-html');

const app=express();
app.use(helmet());
const server=http.createServer(app);
const io=new Server(server);

app.use(express.static(__dirname));

const rooms={};
const MAX_USERS_PER_ROOM=5;
const CHAT_HISTORY_LIMIT=500;
const MESSAGE_RATE_LIMIT=15; 
const RATE_WINDOW_MS=3000;

const userMessageTimestamps={};

function sanitize(msg){return sanitizeHtml(msg,{allowedTags:[],allowedAttributes:{}});}

io.on('connection',socket=>{
    let currentRoom=null;
    let username=null;

    socket.on('joinRoom',data=>{
        username=data.username?.substring(0,16)||`Anon${Math.floor(Math.random()*100000)}`;
        let room=data.room||`room-${Math.floor(Math.random()*100000)}`;
        currentRoom=room;

        if(!rooms[room])rooms[room]={users:[],history:[]};

        if(rooms[room].users.length>=MAX_USERS_PER_ROOM){
            socket.emit('fullRoom',{room});
            return;
        }

        socket.join(room);
        rooms[room].users.push(username);
        socket.to(room).emit('systemMessage',`${username} joined the room`);
        socket.emit('systemMessage',`* Joined room ${room} *`);

        if(rooms[room].history.length>0)socket.emit('chatHistory',rooms[room].history);
        io.to(room).emit('updateUsers',rooms[room].users);
    });

    socket.on('sendMessage',text=>{
        if(!currentRoom||!username)return;
        const now=Date.now();
        if(!userMessageTimestamps[socket.id])userMessageTimestamps[socket.id]=[];
        userMessageTimestamps[socket.id]=userMessageTimestamps[socket.id].filter(t=>now-t<RATE_WINDOW_MS);
        if(userMessageTimestamps[socket.id].length>=MESSAGE_RATE_LIMIT)return;
        userMessageTimestamps[socket.id].push(now);

        const clean=sanitize(text);
        const msgObj={user:username,text:clean};
        if(!rooms[currentRoom])rooms[currentRoom]={users:[],history:[]};
        rooms[currentRoom].history.push(msgObj);
        if(rooms[currentRoom].history.length>CHAT_HISTORY_LIMIT)rooms[currentRoom].history.shift();
        io.to(currentRoom).emit('newMessage',msgObj);
    });

    socket.on('rename',newName=>{
        if(!currentRoom||!username)return;
        const old=username;
        username=newName.substring(0,16);
        if(rooms[currentRoom]){
            const idx=rooms[currentRoom].users.indexOf(old);
            if(idx>=0)rooms[currentRoom].users[idx]=username;
            io.to(currentRoom).emit('updateUsers',rooms[currentRoom].users);
            io.to(currentRoom).emit('systemMessage',`${old} is now ${username}`);
        }
    });

    socket.on('hopRoom',()=>{
        if(!currentRoom||!username)return;
        if(rooms[currentRoom]){
            rooms[currentRoom].users=rooms[currentRoom].users.filter(u=>u!==username);
            socket.to(currentRoom).emit('updateUsers',rooms[currentRoom].users);
            socket.to(currentRoom).emit('systemMessage',`${username} left the room`);
            if(rooms[currentRoom].users.length===0)delete rooms[currentRoom];
        }
        socket.leave(currentRoom);
        currentRoom=null;
    });

    socket.on('disconnect',()=>{
        if(currentRoom&&rooms[currentRoom]){
            rooms[currentRoom].users=rooms[currentRoom].users.filter(u=>u!==username);
            socket.to(currentRoom).emit('updateUsers',rooms[currentRoom].users);
            socket.to(currentRoom).emit('systemMessage',`${username} left the room`);
            if(rooms[currentRoom].users.length===0)delete rooms[currentRoom];
        }
    });
});

const PORT=process.env.PORT||3000;
server.listen(PORT,()=>console.log(`DarkWebChat server running on port ${PORT}`));
