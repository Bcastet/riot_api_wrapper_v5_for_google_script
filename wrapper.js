var api_key = 
var version = jsonRequestRiot("https://ddragon.leagueoflegends.com/api/versions.json")[0];
var champions_data = jsonRequestRiot("http://ddragon.leagueoflegends.com/cdn/"+version+"/data/en_US/champion.json")["data"];
var items_data = jsonRequestRiot("http://ddragon.leagueoflegends.com/cdn/"+version+"/data/en_US/item.json")["data"];
var runes = jsonRequestRiot("http://ddragon.leagueoflegends.com/cdn/"+version+"/data/en_US/runesReforged.json");

 

function test(){
  Logger.log(new ChallengerAccounts("kr"))  
}

function getChallengerAccounts(region){
  return new ChallengerAccounts(region);
}

class ChallengerAccounts{
  constructor(region){
    var url = "https://"+region+".api.riotgames.com/lol/league/v4/challengerleagues/by-queue/RANKED_SOLO_5x5?"+api_key
    var jsonLeague = jsonRequestRiot(url);
    this._jsonLeague = jsonLeague
    this.accountNames = []
    var requests = []
    for(var entry in jsonLeague["entries"]){
      if(entry>150){
        this.accountNames.push(jsonLeague["entries"][entry]["summonerName"]);
        requests.push("https://"+region+".api.riotgames.com/lol/summoner/v4/summoners/" +  jsonLeague["entries"][entry]["summonerId"] + "?" +api_key)
      }
    }
    var summonersJson = jsonRequestRiotAll(requests,null);
    Logger.log("Got summs jsons")
    this.summoners = []
    for(var index in summonersJson){
      this.summoners.push(new Summoner(null,null,summonersJson[index],region));
    }
    Logger.log("Summs set")
    var historiesUrl = []

    url = "https://"+region+".api.riotgames.com/lol/match/v4/matchlists/by-account/";
    for(var index in this.summoners){
      historiesUrl.push(url + this.summoners[index].accountId + "?queue=420&"+ api_key);
    }

    Logger.log("Histories urls set")

    var matchesLists = jsonRequestRiotAll(historiesUrl);
    for(var index in this.summoners){
      this.summoners[index].matchesList = matchesLists[index]["matches"]
    }
  }
}

class Summoner{
  constructor(accountId,summonerName,summonerJson,region){
    this.region = region
    if(this.region == "euw1") this.continent = "europe";
    if(this.region == "kr") this.continent = "asia";
    this.accountId = accountId
    this.summonerName = summonerName
    this._summonerJson = summonerJson
    
    
    if(summonerJson==null){
      if(accountId!=null){
        this._summonerJson = getSummoner({"accountId":accountId})
        
        this.summonerName  = this._summonerJson["name"]
      }else{
        this._summonerJson = getSummoner({"summonerName":summonerName})
        this.accountId  = this._summonerJson["accountId"]
      }
    }else{
      this.summonerName  = this._summonerJson["name"]
      this.accountId  = this._summonerJson["accountId"]
    }
    this.id = this._summonerJson["id"]
    this._playerHistory = null;
    this.matches_list = null;
    this.realName = null;
    this.eloL = null;
  }

  set matchesList(matches_list){
    this.matches_list = matches_list;
  }

  get matchesList(){
    return this.matches_list;
    
  }

  get name(){
    return this.summonerName;
  }

  set name(summonerName){
    this.summonerName = summonerName
  }

  player_history(role,beginTime,patch){
    Logger.log("Player history here")
    if(this._playerHistory==null){
      this._playerHistory = new PlayerHistory(this,role,beginTime,patch)
    }
    return this._playerHistory;
  }

  get elo(){
    if(this.eloL==null){
      this.eloL = getElo(this)
    }
    return this.eloL
  }

  set elo(new_elo){
    this.eloL=new_elo;
  }

}



class PlayerHistory{
  constructor(summoner,role,beginTime,patch,region){
    this.gameSummaries = []
    this.fullGames = []
    if(summoner.matchesList == null) {
      Logger.log("Matches list wasn't set")
      summoner.matchesList = getGames(summoner,beginTime,region);
    }else{
      Logger.log("Matches list was set")
    }
    this.gameSummaries = summoner.matchesList;
    Logger.log(["gameSummaries",this.fullGames])
  }
}

class PlayerStats{
  constructor(matchStatsJson){
    this.damageDealt = matchStatsJson["totalDamageDealtToChampions"]
    this.creepScore = matchStatsJson["totalMinionsKilled"] + matchStatsJson["neutralMinionsKilled"]
    this.kills = matchStatsJson["kills"]
    this.deaths = matchStatsJson["deaths"]
    this.assists = matchStatsJson["assists"]
    this.vision = matchStatsJson["visionScore"]
    this.cc = matchStatsJson["timeCCingOthers"]
    this.golds = matchStatsJson["goldSpent"]
  }
}

class GameHistory{
  constructor(timeline,pid){
    this.golds = []
    this.xp = []
    this.kp = []
    this.events = []

    for(var frameIndex in timeline["frames"]){
      var pframe = timeline["frames"][frameIndex]["participantFrames"][pid]
      this.golds.push(pframe["totalGold"])
      this.xp.push(pframe["xp"])

      if(frameIndex==0) {
        this.kp[frameIndex]=0;
      }else{
        this.kp[frameIndex] = this.kp[frameIndex-1]
      }

      for(var eventI in timeline["frames"][frameIndex]["events"]){
        var event = timeline["frames"][frameIndex]["events"][eventI];
        if(event["participantId"] == pid || event["creatorId"] == pid || event["killedId"] == pid || event["creatorId"]==pid || (event["assistingParticipantIds"]!=undefined && event["assistingParticipantIds"].includes(pid))) this.events.push(event);
        if(event["type"] == "CHAMPION_KILL" && event["assistingParticipantIds"]!=undefined &&  (event["assistingParticipantIds"].includes(pid) || event["killedId"] == pid )) this.kp[frameIndex]+=1;
      }
    }
  }
}

function getGameSummary(gameId,accountId,region){
  var game = getMatch(gameId,region);
  return game;
  var participantJson = getPlayerStats([accountId],game)
  return new GameSummary(participantJson,game) 
}

class GameSummary{
  constructor(participantJson,game,isMatchup=false){
    var timeline = game["timeline"]
    //this._game = game
    this.stats = new PlayerStats(participantJson)
    this.history = new GameHistory(timeline,participantJson["participantId"])
    
    this.win = 0;
    if(participantJson["win"]) this.win = 1;
    this.champion = participantJson["championId"]
    this.build = new Build(this.history,participantJson["participantId"])
    
    this.patch = game["gameVersion"]
    this.lenght = game["gameDuration"]
    this.time = new Date(game["gameCreation"])
    this.teamStats = new TeamStats(participantJson,game)
    this.gameId = game["gameId"]
    this.role = participantJson["teamPosition"];
    this.pid = participantJson["participantId"]
    this.side = participantJson["teamId"]

    this.opponent = null
    if(!isMatchup){
      var mustats = calculateOpponent(this.pid, this.role, game)
      if(mustats!=null) {
        this.opponent = new GameSummary(mustats,game,true);
      }else{
        this.opponent = new GameSummary(game["participants"][(this.pid-1+5)%10],game,true)
        this.opponent.role = "AUTO"
      }
      this.mu_status = "COUNTER"
      if(isBlind(this.pid,this.opponent.pid)) this.mu_status = "BLIND"
    }
    this.runes = new Runes(participantJson);
    
  }
}

class TeamStats{
  constructor(participantJson,game){
    var team = participantJson["teamId"]
    this.kills = 0
    this.damages = 0
    this.golds = 0

    for(var index in game["participants"]){
      var p = game["participants"][index];
      if(p["teamId"]==team){
        this.kills += p["kills"]
        this.damages += p["totalDamageDealtToChampions"]
        this.golds += p["goldSpent"]
      }
    }

    this.bans = getBans(game,team);
  }
}

class Build{
  constructor(gameHistory,pid){
    this.items = []
    for(var index in gameHistory.events){
      if(gameHistory.events[index]["type"] == "ITEM_PURCHASED" && gameHistory.events[index]["participantId"] == pid){
        //Logger.log(items_data[gameHistory.events[index]["itemId"]]["name"])
        if(items_data[gameHistory.events[index]["itemId"]]!=undefined && (items_data[gameHistory.events[index]["itemId"]]["into"]==undefined || parseInt(items_data[gameHistory.events[index]["itemId"]]["into"][0])>7000) && items_data[gameHistory.events[index]["itemId"]]["tags"].includes("Trinket") == false && items_data[gameHistory.events[index]["itemId"]]["tags"].includes("Consumable") == false && items_data[gameHistory.events[index]["itemId"]]["name"].includes("Doran") == false && items_data[gameHistory.events[index]["itemId"]]["name"]!="Control Ward" && items_data[gameHistory.events[index]["itemId"]]["name"]!="Cull"){
          this.items.push(items_data[gameHistory.events[index]["itemId"]])
          
          //Logger.log("Added "+items_data[gameHistory.events[index]["itemId"]]["name"])
        }
      }
      if(gameHistory.events[index]["type"] == "ITEM_UNDO" && gameHistory.events[index]["participantId"] == pid){
        var inBuild = this.items.indexOf(items_data[gameHistory.events[index]["beforeId"]])
        if(inBuild!=-1) {
          this.items.splice(inBuild,1);
          //Logger.log("Added "+items_data[gameHistory.events[index]["beforeId"]]["name"])
        }
      }
    }
  }
}

class Runes{
  constructor(participantJson){
    this.mainTree = search(runes,participantJson["perks"]["styles"][0]["style"])
    this.keystone = search(this.mainTree["slots"][0]["runes"],participantJson["perks"]["styles"][0]["selections"][0]["perk"])
    this.subTree = search(runes,participantJson["perks"]["styles"][1]["style"]);
  }
}

function getSummoner(identifier){
  var request = ""

  if(identifier["accountId"]!=undefined) request = "https://euw1.api.riotgames.com/lol/summoner/v4/summoners/by-account/" + identifier["accountId"] + api_key;
  if(identifier["summonerName"]!=undefined) request = "https://euw1.api.riotgames.com/lol/summoner/v4/summoners/by-name/" +  identifier["summonerName"] + api_key;
  return jsonRequestRiot(request);
}

function getGames(summoner, start_time, region){
  var queue = "420"
  var request = "https://"+summoner.continent+".api.riotgames.com/lol/match/v5/matches/by-puuid/"+summoner._summonerJson["puuid"]+"/ids?queue="+queue+"&start=0&count=100&startTime="+(1+(start_time.getTime()/1000))+"&"+api_key;
  
  var ids = jsonRequestRiot(request);
  var matchRequests = [];
  var matchRequestsTimelines = [];
  for(var ind in ids){
    var base = "https://"+summoner.continent+".api.riotgames.com/lol/match/v5/matches/" + ids[ind];
    matchRequests.push(base+"?"+api_key)
    matchRequestsTimelines.push(base+"/timeline?"+api_key)
  }
  
  var matches = jsonRequestRiotAll(matchRequests);
  var timelines = jsonRequestRiotAll(matchRequestsTimelines);
  
  var toRet = [];
  for(var ind in matches){
    var participantJson;
    matches[ind] = matches[ind]["info"]
    matches[ind]["timeline"] = timelines[ind]["info"];
    for(var pid in matches[ind]["participants"]){
      if(matches[ind]["participants"][pid]["summonerId"] == summoner.id) participantJson = matches[ind]["participants"][pid];
    }
    
    toRet[ind] = new GameSummary(participantJson,matches[ind]);
  }
  Logger.log(["TORET",toRet])
  return toRet;
}

function getBans(game,team){
  var teamI=1
  if(team==100) teamI = 0;
  var toRet = []
  
  for(var banI in game["teams"][teamI]["bans"]){
    //Logger.log(game["teams"][teamI]["bans"][banI]["championId"])
    var id =game["teams"][teamI]["bans"][banI]["championId"]
    if(id!=-1){
      toRet.push(champion(id,champions_data)["name"])
    }else{
      toRet.push("None")
    }
  }
  return toRet
}

function champion(id,champions_data){
  for(var k in champions_data){
    if(champions_data[k]["key"] == id) return champions_data[k];
  }
}

function calculateOpponent(pid, role, game){
  for(var participant in game["participants"]){
    if(game["participants"][participant]["participantId"] != pid && game["participants"][participant]["teamPosition"] == role) return game["participants"][participant];
  }
}

function search(tree,id){
  for(var index in tree){
    if(tree[index]["id"] == id){
      return tree[index];
    }
  }
}

function getElo(summoner){
  var api_key = "?api_key=RGAPI-de025284-d4e8-4500-8131-5f72a5152abd";
  var request = "https://euw1.api.riotgames.com/lol/league/v4/entries/by-summoner/" + summoner.id + api_key;
  var result = jsonRequestRiot(request)
  for(var index in result){
    Logger.log(result[index])
    if(result[index]["summonerId"] == summoner.id && result[index]["queueType"] == "RANKED_SOLO_5x5") return [result[index]["tier"] + " " + result[index]["rank"],result[index]["leaguePoints"]];
  }
  return ["",""]
}

function jsonRequestRiotAll(requests,completeRequests){
  if(requests!=null){
    for(var ind in requests){
      requests[ind] = {"url" : requests[ind],"muteHttpExceptions":true}
    }
  }else{
    requests=completeRequests;
  }
  var response = UrlFetchApp.fetchAll(requests);
  var toRet=[]
  
  for(var matchIndex in response){
    var json = response[matchIndex].getContentText();
    var parsed = JSON.parse(json);
    if (parsed["status"]!=undefined){
      Logger.log("On request "+matchIndex)
      Logger.log(requests[matchIndex])
      Logger.log(parsed)
      if(parsed["status"]["status_code"]==429){
        Logger.log("Sleeping 10 seconds")
        Utilities.sleep(10000)
      }
      toRet = toRet.concat(jsonRequestRiotAll(null,requests.slice(matchIndex,requests.length)));
      break
    }
    toRet[matchIndex] = parsed;
  }
  return toRet;
}

function getFullMatchesFromHistory(matchesList,patch,role,beginTime,region){
  toRet = [];
  for(var index in matchesList){

  }
  return toRet;
}

function pickTurnFromPid(pid){
  if(pid==1) return 1;
  if(pid==6) return 2;
  if(pid==7) return 3;
  if(pid==2) return 4;
  if(pid==3) return 5;
  if(pid==8) return 6;
  if(pid==9) return 7;
  if(pid==4) return 8;
  if(pid==5) return 9;
  if(pid==10) return 10;
}

function isBlind(pid,ennemy_pid){
  return pickTurnFromPid(pid)>pickTurnFromPid(ennemy_pid);
}

function jsonRequestRiot(request, params = {'muteHttpExceptions': true, 'validateHttpsCertificates' : false}){
  Logger.log("Riot api")
  Logger.log(request);
  var response = UrlFetchApp.fetch(request, params);
  var json = response.getContentText();
  var parsed = JSON.parse(json);
  if (parsed["status"]!=undefined){
    if(parsed["status"]["status_code"]==429){
      Logger.log("Sleeping for 10 seconds");
      Utilities.sleep(10000)
      return jsonRequestRiot(request,params);
    }if(parsed["status"]["status_code"]==504){
      Logger.log(request,parsed);
      Utilities.sleep(200);
      return jsonRequestRiot(request,params);
    }
  }
  return parsed;
}

function getSummonerID(summonerName){
  return new Summoner(null,summonerName,null,"euw1").accountId
}

function getSummonerName(summonerId){
  return new Summoner(summonerId,null,null,"euw1").summonerName
}

function getSummonerObject(summonerId){
  return new Summoner(summonerId,null,null,"euw1")
}

function objectifyJson(summonerJson){
  return new Summoner(null,null,summonerJson,"euw1")
}

function getSummonerFromName(summonerName){
  return new Summoner(null,summonerName,null,"euw1")
}

