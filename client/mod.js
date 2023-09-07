// Multiplayer Mod (API v2 Edition)
(async function(){
    if(!window.experiments.multiplayer){
        console.error("No access")
        return
    }
    // Yay shaders
    var shaderCode = await (await fetch('https://raw.githubusercontent.com/Powerbox1000-Studios/some-random-platformer-multiplayer/main/client/shaders.js')).text()
    eval(shaderCode)

    // All supported colors (feel free to make a pull request to add more)
    var colors = [
        "red",
        "orange",
        "yellow",
        "green",
        "mint",
        "blue",
        "navyblue",
        "purple",
        "pink",
        "magenta"
    ]
    
    loadColor("red", [255, 0, 0])
    loadColor("orange", [255, 70, 0])
    loadColor("yellow", [255, 255, 0])
    loadColor("green", [0, 200, 40])
    loadColor("mint", [0, 227, 163])
    loadColor("blue", [0, 221, 225])
    loadColor("navyblue", [0, 53, 150])
    loadColor("purple", [144, 0, 255])
    loadColor("pink", [250, 134, 196])
    loadColor("magenta", [255, 41, 141])
    
    // Constants (Don't edit unless you know what you're doing!)
    const SUPPORTED_PROTOCOLS = [
        "protocols.multiplayer.v1"
    ]
    
    // Global Flags
    window.showSelf = false

    // Functions
    function vec2ToArray(vec){
        return [vec.x, vec.y]
    }

    // Mod Constructor
    var mod = new Mod({
        version: 1,
        name: "Multiplayer Mod",
        id: "multiplayer",
        permissions: [
            "IDENTIFY",
            "WRITE_LEVEL",
            "CUSTOM_SPRITES",
            "EVENTS"
        ],
        onReady: async function(data){
            // Exit mod checks
            if(!data.hasPerms){
                console.error('Multiplayer mod cannot run without permissions!')
                return false
            }

            var user = await mod.getUserInfo()
            if(user.isGuest){
                console.error('You must be logged in to use Multiplayer Mod!')
                return false
            }
            
            // -------------------------
            // | The Mod's Actual Code |
            // -------------------------
            
            // Flags
            var isHost = false
            var choosingDifficulty = false
            var messageState = null

            // Other Variables
            var url = null
            var ws = null
            var updateHandler = null
            var token = localStorage.code
            var playerSprites = []

            // WebSocker handler
            function handleSocketMsg(evt){
                try{
                    var data = JSON.parse(evt.data)
                }catch(e){
                    console.error(e)
                    return false
                }

                switch(data.type){
                    case "heartbeat":
                        ws.send(JSON.stringify({
                            type: "heartbeatResponse"
                        }))
                        break
                    case "joinResponse":
                        if(data.success){
                            isHost = data.isHost
                            messageState = "loadData"
                            go("message", "Loading level data...", 20, true, () => {
                                ws.close()
                            })
                            window.currentScene = "__fireMessage"
                        }else{
                            ws.close()
                            go("message", data.message, 20)
                        }
                        break
                    case "loadDataResponse":
                        if(data.success){
                            mod.addLevel('multiplayer_loaded', 'Multiplayer', data.level)
                            choosingDifficulty = true
                            go("difficulty")
                        }else{
                            ws.close()
                            go("message", data.message, 20)
                        }
                        break
                    case "playerUpdate":
                        if(window.currentScene == "game"){
                            playerSprites.forEach((spr) => {
                                spr.destroy()
                            })
                            playerSprites = []
                            data.players.forEach((player) => {
                                if(showSelf || player.id != user.id){
                                    var spr = mod.addSprite((!player.isCrouched ? "player" : "playerCrouch"), player.pos)
                                    spr.unuse("body")
                                    spr.unuse("solid")
                                    spr.use(shader(player.color))
                                    playerSprites.push(spr)
                                }
                            })
                        }
                        ws.send(JSON.stringify({
                            type: "debug",
                            message: "packets.playerUpdate"
                        }))
                        break
                }
            }

            // For emergency purposes
            window.forceCloseSocket = () => {
                return ws.close()
            }

            // Event Hooks
            mod.on("sceneChange", (e) => {
                if(typeof updateHandler == "function"){
                    updateHandler()
                    updateHandler = null
                }
                if(e.scene == "__fireMessage"){
                    window.currentScene = "message"
                    return true
                }
                
                if(e.scene == "difficulty"){
                    if(!choosingDifficulty){
                        messageState = "preServerConnect"
                        go("message", "Connecting to server...", 20, false)
                    }
                    choosingDifficulty = false
                }else if(e.scene == "game"){
                    choosingDifficulty = false
                    setTimeout(() => {
                        var player = get("player")[0]
                        updateHandler = player.onUpdate(() => {
                            ws.send(JSON.stringify({
                                type: "move",
                                pos: vec2ToArray(player.pos),
                                isCrouched: (get("player")[0].inspect().sprite == '"playerCrouch"'),
                                auth: token
                            }))
                        })
                    }, 100)
                }else if(e.scene == "died"){
                    ws.send(JSON.stringify({
                        type: "move",
                        pos: [0, 0],
                        auth: token
                    }))
                }else if(e.scene == "finish"){
                    ws.close()
                }else if(messageState != null && e.scene == "message"){
                    switch(messageState){
                        case "preServerConnect":
                            var input = prompt('Enter server address:')
                            if(input == null){
                                go("message", "Failed to connect: User aborted", 20)
                                break
                            }
                            try{
                                var u = new URL(input)
                                if(['ws:', 'wss:'].indexOf(u.protocol) <= -1){
                                    u.protocol = 'wss:' // default to wss
                                }
                                url = u.href
                            }catch(e){
                                go("message", "Failed to connect: Invalid URL", 20)
                                return false
                            }

                            // This is the fun part: WebSocket stuff!
                            ws = new WebSocket(url, SUPPORTED_PROTOCOLS)
                            ws.onclose = () => {
                                mod.removeLevel('multiplayer_loaded')
                                console.info('Multiplayer Mod: WebSocket closed')
                                if(["title", "finish", "message"].indexOf(window.currentScene) == -1){
                                    go("message", "Disconnected", 20, true, () => {
                                        go("title")
                                    })
                                }
                                ws = null
                            }
                            function connectWait(){
                                if(ws.readyState == 1){
                                    messageState = "serverHandshake"
                                    go("message", "Loading server info...", 20, false)
                                    window.currentScene = "__fireMessage"
                                }else if(ws.readyState == 3){
                                    go("message", "Failed to connect: Server did not respond", 20)
                                }else{
                                    setTimeout(connectWait, 20)
                                }
                            }
                            messageState = null
                            connectWait()
                            break
                        case "serverHandshake":
                            // Set WebSocket event handler
                            ws.onmessage = handleSocketMsg
                            
                            // Send join packet
                            ws.send(JSON.stringify({
                                type: "join",
                                user: user,
                                auth: token
                            }))
                            messageState = null
                            break
                        case "loadData":
                            ws.send(JSON.stringify({
                                type: "loadData",
                                auth: token
                            }))
                            messageState = null
                            break
                    }
                }
            })
            console.log(messageState)
        }
    })
})()
