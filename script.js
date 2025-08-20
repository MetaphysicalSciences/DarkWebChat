const socket=io();
let username='';
let roomId='';
let messageTimestamps=[];
const RATE_LIMIT=15;
const RATE_WINDOW=3000;

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

function randomAnon(){return `Anon${Math.floor(Math.random()*100000)}`;}
function appendMsg(msg){const div=document.createElement('div');div.textContent=msg;chatBox.appendChild(div);chatBox.scrollTop=chatBox.scrollHeight;}
function updateRoster(users){userList.textContent=users.join(', ');}
function canSend(){const now=Date.now();messageTimestamps=messageTimestamps.filter(t=>now-t<RATE_WINDOW);return messageTimestamps.length<RATE_LIMIT;}

function joinRoom(rid){
    roomId=rid||roomInput.value||`room-${Math.floor(Math.random()*100000)}`;
    roomInput.value=roomId;
    roomLinkDisplay.textContent=`Room link: ${window.location.origin}${window.location.pathname}#${roomId}`;
    if(!username) username=randomAnon();
    socket.emit('joinRoom',{username,roomId});
}

setUsernameBtn.onclick=()=>{if(usernameInput.value){const old=username||randomAnon();username=usernameInput.value.substring(0,16);usernameInput.value='';socket.emit('rename',username);appendMsg(`* Your username is now ${username} *`);}};
joinRoomBtn.onclick=()=>joinRoom();
hopBtn.onclick=()=>joinRoom(`room-${Math.floor(Math.random()*100000)}`);
sendBtn.onclick=()=>{if(!msgInput.value)return;if(!canSend())return;messageTimestamps.push(Date.now());socket.emit('sendMessage',msgInput.value);msgInput.value='';};

msgInput.addEventListener('keypress',e=>{if(e.key==='Enter')sendBtn.click();});
usernameInput.addEventListener('keypress',e=>{if(e.key==='Enter')setUsernameBtn.click();});
roomInput.addEventListener('keypress',e=>{if(e.key==='Enter')joinRoomBtn.click();});

socket.on('newMessage',msg=>appendMsg(`${msg.user}: ${msg.text}`));
socket.on('systemMessage',msg=>appendMsg(`* ${msg} *`));
socket.on('updateRoster',users=>updateRoster(users));
socket.on('chatHistory',history=>history.forEach(m=>appendMsg(`${m.user}: ${m.text}`)));
socket.on('roomFull',()=>appendMsg('* Room is full, try another *'));

if(window.location.hash) joinRoom(window.location.hash.substring(1));
