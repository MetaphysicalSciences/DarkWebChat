let username='';
let roomId='';
let ws;
const chatBox=document.getElementById('chatBox');
const userList=document.getElementById('userList');
const usernameInput=document.getElementById('usernameInput');
const setUsernameBtn=document.getElementById('setUsernameBtn');
const hopBtn=document.getElementById('hopBtn');
const msgInput=document.getElementById('msgInput');
const sendBtn=document.getElementById('sendBtn');
const roomLinkDisplay=document.getElementById('roomLinkDisplay');

function appendMsg(msg){
  const div=document.createElement('div');
  div.textContent=msg;
  chatBox.appendChild(div);
  chatBox.scrollTop=chatBox.scrollHeight;
}

function updateRoster(users){userList.textContent=users.join(', ');}

function randomAnon(){return 'Anon'+Math.floor(Math.random()*100000);}

function generateRoom(){return 'room-'+Math.floor(Math.random()*100000);}

function connectWebSocket(){
  ws=new WebSocket(`ws://${window.location.hostname}:8080`);
  ws.onopen=()=>{ws.send(JSON.stringify({type:'join',room:roomId,username}));};
  ws.onmessage=msg=>{
    const data=JSON.parse(msg.data);
    if(data.type==='message') appendMsg(`${data.user}: ${data.text}`);
    if(data.type==='join') appendMsg(`* ${data.user} joined the room *`);
    if(data.type==='leave') appendMsg(`* ${data.user} left the room *`);
    if(data.type==='rename') appendMsg(`* ${data.oldName} is now ${data.newName} *`);
    if(data.type==='roster') updateRoster(data.users);
    if(data.type==='full') alert('Room full, try random hop');
  };
}

function joinRoom(rid){
  roomId=rid||generateRoom();
  if(!username) username=randomAnon();
  roomLinkDisplay.textContent=`Room link: ${window.location.origin}#${roomId}`;
  connectWebSocket();
}

setUsernameBtn.onclick=()=>{
  if(!usernameInput.value)return;
  const old=username||randomAnon();
  username=usernameInput.value.substring(0,16);
  usernameInput.value='';
  ws.send(JSON.stringify({type:'rename',newName:username}));
};

hopBtn.onclick=()=>{if(ws)ws.close();joinRoom(generateRoom());};

sendBtn.onclick=()=>{if(!msgInput.value)return;ws.send(JSON.stringify({type:'message',text:msgInput.value}));msgInput.value='';};

msgInput.addEventListener('keypress',e=>{if(e.key==='Enter')sendBtn.click();});
usernameInput.addEventListener('keypress',e=>{if(e.key==='Enter')setUsernameBtn.click();});

window.onload=()=>{
  const hash=window.location.hash.substring(1);
  joinRoom(hash);
};
