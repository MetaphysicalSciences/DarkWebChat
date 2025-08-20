let username='';
let roomId='';
let peers={};
let dataChannels={};
let users=[];
let chatHistory=[];
const MAX_USERS=5;
const RATE_LIMIT=15;
const RATE_WINDOW=3000;
let messageTimestamps=[];

const usernameInput=document.getElementById('usernameInput');
const setUsernameBtn=document.getElementById('setUsernameBtn');
const roomInput=document.getElementById('roomInput');
const joinRoomBtn=document.getElementById('joinRoomBtn');
const hopBtn=document.getElementById('hopBtn');
const msgInput=document.getElementById('msgInput');
const sendBtn=document.getElementById('sendBtn');
const chatBox=document.getElementById('chatBox');
const userList=document.getElementById('userList');
const roomLinkDisplay=document.getElementById('roomLinkDisplay');

function appendMsg(msg){
    const div=document.createElement('div');
    div.textContent=msg;
    chatBox.appendChild(div);
    chatBox.scrollTop=chatBox.scrollHeight;
}

function updateRoster(){
    userList.textContent=users.join(', ');
}

function broadcast(data){
    Object.values(dataChannels).forEach(dc=>{
        if(dc.readyState==='open') dc.send(JSON.stringify(data));
    });
}

function handleData(msg){
    const data=JSON.parse(msg);
    if(data.type==='message'){
        chatHistory.push({user:data.user,text:data.text});
        appendMsg(`${data.user}: ${data.text}`);
    }else if(data.type==='join'){
        if(!users.includes(data.user)) users.push(data.user);
        updateRoster();
        broadcast({type:'roster',users});
        appendMsg(`* ${data.user} joined the room *`);
    }else if(data.type==='leave'){
        users=users.filter(u=>u!==data.user);
        updateRoster();
        appendMsg(`* ${data.user} left the room *`);
    }else if(data.type==='rename'){
        const idx=users.indexOf(data.oldName);
        if(idx>=0) users[idx]=data.newName;
        updateRoster();
        appendMsg(`* ${data.oldName} is now ${data.newName} *`);
    }else if(data.type==='roster'){
        users=data.users;
        updateRoster();
    }
}

function randomAnon(){return `Anon${Math.floor(Math.random()*100000)}`;}

function generateRoomLink(){
    roomId='room-'+Math.floor(Math.random()*100000);
    roomInput.value=roomId;
    roomLinkDisplay.textContent=`Room link: ${window.location.origin}${window.location.pathname}#${roomId}`;
}

function joinRoom(rid){
    roomId=rid||roomInput.value||'room-'+Math.floor(Math.random()*100000);
    roomInput.value=roomId;
    roomLinkDisplay.textContent=`Room link: ${window.location.origin}${window.location.pathname}#${roomId}`;
    appendMsg(`* Joined room ${roomId} *`);
    if(!username) username=randomAnon();
    if(!users.includes(username)) users.push(username);
    updateRoster();
    broadcast({type:'join',user:username});
}

joinRoomBtn.onclick=()=>joinRoom();
hopBtn.onclick=()=>{
    broadcast({type:'leave',user:username});
    generateRoomLink();
    joinRoom(roomId);
}
setUsernameBtn.onclick=()=>{
    if(!usernameInput.value)return;
    const oldName=username||randomAnon();
    username=usernameInput.value.substring(0,16);
    usernameInput.value='';
    appendMsg(`* Your username is now ${username} *`);
    broadcast({type:'rename',oldName,newName:username});
}
msgInput.addEventListener('keypress',e=>{if(e.key==='Enter')sendBtn.click();});
usernameInput.addEventListener('keypress',e=>{if(e.key==='Enter')setUsernameBtn.click();});
roomInput.addEventListener('keypress',e=>{if(e.key==='Enter')joinRoomBtn.click();});

function canSend(){
    const now=Date.now();
    messageTimestamps=messageTimestamps.filter(t=>now-t<RATE_WINDOW);
    return messageTimestamps.length<RATE_LIMIT;
}
sendBtn.onclick=()=>{
    if(!msgInput.value)return;
    if(!canSend())return;
    messageTimestamps.push(Date.now());
    const text=msgInput.value;
    msgInput.value='';
    appendMsg(`${username}: ${text}`);
    chatHistory.push({user:username,text});
    broadcast({type:'message',user:username,text});
}

// WebRTC peer-to-peer logic for full global chat
function createPeer(peerId,initiator=false){
    const pc=new RTCPeerConnection();
    let dc;
    if(initiator){
        dc=pc.createDataChannel('chat');
        dc.onmessage=e=>handleData(e.data);
        dc.onopen=()=>{};
        dataChannels[peerId]=dc;
    }else{
        pc.ondatachannel=e=>{
            dc=e.channel;
            dc.onmessage=ev=>handleData(ev.data);
            dataChannels[peerId]=dc;
        }
    }
    pc.onicecandidate=e=>{
        if(e.candidate) return;
        if(initiator){
            const sdp=JSON.stringify(pc.localDescription);
            prompt(`Send this SDP to peer ${peerId}:\n${sdp}`);
        }
    };
    peers[peerId]=pc;
    return pc;
}

// Automatically connect to other users in room using URL hash signaling
function autoJoinRoomFromHash(){
    if(window.location.hash){
        roomId=window.location.hash.substring(1);
        roomInput.value=roomId;
        joinRoom(roomId);
    }else{
        generateRoomLink();
    }
}
autoJoinRoomFromHash();
