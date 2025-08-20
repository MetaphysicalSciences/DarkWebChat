const express=require('express');
const app=express();
const http=require('http').createServer(app);
const io=require('socket.io')(http,{cors:{origin:"*"}});

app.use(express.static(__dirname));

const rooms={};

io.on('connection',socket=>{
    let currentRoom='';
    let username='';

    socket.on('joinRoom',data=>{
        username=data.username||`Anon${Math.floor(Math.random()*100000)}`;
        currentRoom=data.roomId;
        if(!rooms[currentRoom]) rooms[currentRoom]={users:[],messages:[]};
        if(rooms[currentRoom].users.length>=5){
            socket.emit('roomFull');
            return;
        }
        rooms[currentRoom].users.push({id:socket.id,username});
        socket.join(currentRoom);

        io.to(currentRoom).emit('systemMessage',`${username} joined the room`);
        io.to(currentRoom).emit('updateRoster',rooms[currentRoom].users.map(u=>u.username));
        socket.emit('chatHistory',rooms[currentRoom].messages);
    });

    socket.on('sendMessage',msg=>{
        if(!currentRoom) return;
        const message={user:username,text:msg};
        rooms[currentRoom].messages.push(message);
        if(rooms[currentRoom].messages.length>500) rooms[currentRoom].messages.shift();
        io.to(currentRoom).emit('newMessage',message);
    });

    socket.on('rename',newName=>{
        if(!currentRoom) return;
        const oldName=username;
        username=newName.substring(0,16);
        const u=rooms[currentRoom].users.find(u=>u.id===socket.id);
        if(u) u.username=username;
        io.to(currentRoom).emit('systemMessage',`${oldName} is now ${username}`);
        io.to(currentRoom).emit('updateRoster',rooms[currentRoom].users.map(u=>u.username));
    });

    socket.on('disconnect',()=>{
        if(!currentRoom) return;
        if(!rooms[currentRoom]) return;
        rooms[currentRoom].users=rooms[currentRoom].users.filter(u=>u.id!==socket.id);
        io.to(currentRoom).emit('systemMessage',`${username} left the room`);
        io.to(currentRoom).emit('updateRoster',rooms[currentRoom].users.map(u=>u.username));
        if(rooms[currentRoom].users.length===0) delete rooms[currentRoom];
    });
});

http.listen(3000,()=>console.log('Server running on port 3000'));
