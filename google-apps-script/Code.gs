/**
 * Bachelor Book shared Sheet API.
 * Attach this script to the Google Sheet and deploy it as a Web App:
 * Execute as: Me; Who has access: Anyone.
 */

function doGet(e) {
  try {
    var action = (e && e.parameter && e.parameter.action) || "state";
    if (action !== "state") return json_({ ok: false, error: "Unknown action" });
    return json_(getState_());
  } catch (error) {
    return json_({ ok: false, error: String(error && error.message || error) });
  }
}

function doPost(e) {
  try {
    var payload = JSON.parse(e.postData.contents || "{}");
    if (payload.action === "placeBet") return json_(placeBet_(payload.ticket));
    if (payload.action === "registerParticipant") return json_(registerParticipant_(payload.participant));
    return json_({ ok: false, error: "Unknown action" });
  } catch (error) {
    return json_({ ok: false, error: String(error && error.message || error) });
  }
}

function registerParticipant_(name) {
  var participant = String(name || "").trim();
  if (!participant || participant.length > 30) throw new Error("Enter a participant name between 1 and 30 characters");
  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    var sheet = sheet_("Participants");
    var rows = rows_("Participants");
    var existing = rows.find(function(row) { return String(row.Bettor || "").trim().toLowerCase() === participant.toLowerCase(); });
    if (existing) {
      if (!bool_(existing["Active?"])) throw new Error("This participant is inactive; ask the organizer");
      return { ok: true, participant: String(existing.Bettor).trim(), existing: true };
    }
    sheet.appendRow([participant, true, Number(getConfig_().STARTING_UNITS || 100), "Registered from website"]);
    SpreadsheetApp.flush();
    return { ok: true, participant: participant, existing: false };
  } finally {
    lock.releaseLock();
  }
}

function onOpen() {
  SpreadsheetApp.getUi().createMenu("Bachelor Book")
    .addItem("Delete a bet", "deleteBetPrompt")
    .addToUi();
}

function deleteBetPrompt() {
  var ui = SpreadsheetApp.getUi();
  var response = ui.prompt("Delete a bet", "Paste the exact Bet ID from the Bets tab. This permanently removes the ticket and all of its legs.", ui.ButtonSet.OK_CANCEL);
  if (response.getSelectedButton() !== ui.Button.OK) return;
  var betId = String(response.getResponseText() || "").trim();
  if (!betId) { ui.alert("No Bet ID was entered."); return; }
  var confirmation = ui.alert("Confirm permanent deletion", "Delete bet " + betId + " and refund its stake through the recalculated ledger?", ui.ButtonSet.YES_NO);
  if (confirmation !== ui.Button.YES) return;
  var result = deleteBetById_(betId);
  ui.alert(result.deleted ? "Bet deleted. The website will update on its next sync." : "No matching Bet ID was found.");
}

function deleteBetById_(betId) {
  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    var deleted = false;
    [["Bet Legs", "Bet ID"], ["Bets", "Bet ID"]].forEach(function(target) {
      var sheet = sheet_(target[0]);
      if (sheet.getLastRow() < 2) return;
      var values = sheet.getDataRange().getValues();
      var idColumn = values[0].indexOf(target[1]);
      for (var row = values.length - 1; row >= 1; row--) {
        if (String(values[row][idColumn]).trim() === betId) {
          sheet.deleteRow(row + 1);
          deleted = true;
        }
      }
    });
    SpreadsheetApp.flush();
    return { deleted: deleted };
  } finally {
    lock.releaseLock();
  }
}

function json_(value) {
  return ContentService.createTextOutput(JSON.stringify(value)).setMimeType(ContentService.MimeType.JSON);
}

function sheet_(name) {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(name);
  if (!sheet) throw new Error("Missing required sheet: " + name);
  return sheet;
}

function rows_(name) {
  var values = sheet_(name).getDataRange().getValues();
  if (values.length < 2) return [];
  var headers = values[0];
  return values.slice(1).filter(function(row) { return row.some(function(value) { return value !== ""; }); }).map(function(row) {
    var object = {};
    headers.forEach(function(header, index) { object[header] = serialize_(row[index]); });
    return object;
  });
}

function rowsFromHeader_(name, firstHeader) {
  var values = sheet_(name).getDataRange().getValues();
  var headerRow = values.findIndex(function(row) { return row[0] === firstHeader; });
  if (headerRow < 0) throw new Error("Missing " + firstHeader + " header in " + name);
  var headers = values[headerRow];
  return values.slice(headerRow + 1).filter(function(row) { return row.some(function(value) { return value !== ""; }); }).map(function(row) {
    var object = {};
    headers.forEach(function(header, index) { object[header] = serialize_(row[index]); });
    return object;
  });
}

function slug_(value) {
  return String(value).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

function normalizePlayers_(players) {
  var skills = ["scoring", "shooting", "playmaking", "defense", "rebounding", "stamina"];
  var values = {};
  skills.forEach(function(skill) {
    var mean = players.reduce(function(sum, player) { return sum + Number(player[skill] || 5); }, 0) / players.length;
    values[skill] = players.map(function(player) { return Math.max(1, Math.min(10, Number(player[skill] || 5) - mean + 5)); });
  });
  return players.map(function(player, index) {
    skills.forEach(function(skill) { player[skill] = values[skill][index]; });
    player.overall = skills.reduce(function(sum, skill) { return sum + player[skill]; }, 0) / skills.length;
    player.modelOverall = player.overall * .35 + player.scoring * .2 + player.shooting * .1 + player.playmaking * .1 + player.defense * .15 + player.rebounding * .07 + player.stamina * .03;
    player.modelOffense = player.scoring * .45 + player.shooting * .25 + player.playmaking * .2 + player.overall * .1;
    player.modelDefense = player.defense * .6 + player.rebounding * .25 + player.stamina * .15;
    player.propUsage = (player.scoring + player.playmaking) / 20;
    return player;
  });
}

function serialize_(value) {
  if (Object.prototype.toString.call(value) === "[object Date]") return value.toISOString();
  return value;
}

function bool_(value) {
  return value === true || String(value).toUpperCase() === "TRUE";
}

function numberOrNull_(value) {
  return value === "" || value === null ? null : Number(value);
}

function getConfig_() {
  var config = {};
  rows_("App Config").forEach(function(row) { config[row.Key] = row.Value; });
  return config;
}

function canonicalGame_(gameId) {
  var games = {
    "game-1": { team1: "Team A", team2: "Team B", bye: "Team C" },
    "game-2": { team1: "Team B", team2: "Team C", bye: "Team A" },
    "game-3": { team1: "Team C", team2: "Team A", bye: "Team B" }
  };
  return games[String(gameId || "")] || null;
}

function syncTeamNames_() {
  var configSheet = sheet_("App Config");
  var config = getConfig_();
  var scheduleRows = rows_("Schedule & Results");
  var firstGame = scheduleRows.find(function(row) { return row["Game ID"] === "game-1"; }) || {};
  var defaults = {
    TEAM_A_NAME: firstGame["Team 1"] || "Team A",
    TEAM_B_NAME: firstGame["Team 2"] || "Team B",
    TEAM_C_NAME: firstGame.Bye || "Team C"
  };
  ["TEAM_A_NAME", "TEAM_B_NAME", "TEAM_C_NAME"].forEach(function(key) {
    if (config[key] === undefined || String(config[key]).trim() === "") {
      configSheet.appendRow([key, defaults[key], "Central display name used throughout the Sheet and website.", "Organizer"]);
      config[key] = defaults[key];
    }
  });

  var names = {
    "Team A": String(config.TEAM_A_NAME).trim(),
    "Team B": String(config.TEAM_B_NAME).trim(),
    "Team C": String(config.TEAM_C_NAME).trim()
  };
  var scheduleSheet = sheet_("Schedule & Results");
  var values = scheduleSheet.getDataRange().getValues();
  if (!values.length) return;
  var columns = index_(values[0]);
  for (var row = 1; row < values.length; row++) {
    var game = canonicalGame_(values[row][columns["Game ID"]]);
    if (!game) continue;
    var nextNames = [names[game.team1], names[game.team2], names[game.bye]];
    var currentNames = [values[row][columns["Team 1"]], values[row][columns["Team 2"]], values[row][columns.Bye]];
    if (currentNames.join("\u0000") !== nextNames.join("\u0000")) {
      scheduleSheet.getRange(row + 1, columns["Team 1"] + 1, 1, 3).setValues([nextNames]);
    }
  }
}

function getState_() {
  syncTeamNames_();
  settleBets_();
  var config = getConfig_();
  var players = rowsFromHeader_("Quick Player Ratings", "Player").filter(function(row) { return row.Player; }).map(function(row) {
    return {
      id: slug_(row.Player), name: row.Player, active: String(row["Active?"]).toLowerCase() !== "no",
      notes: [row.Notes, row["Friend Notes"]].filter(Boolean).join(" — "), overall: Number(row["Overall Talent"] || 5),
      scoring: Number(row.Scoring || 5), shooting: Number(row.Shooting || 5), playmaking: Number(row["Playmaking / Handle"] || 5),
      defense: Number(row.Defense || 5), rebounding: Number(row["Rebounding / Size"] || 5), stamina: Number(row.Stamina || 5),
      confidence: row.Confidence || "Medium", modelOverall: Number(row["Model Overall"] || 5), modelOffense: Number(row["Model Offense"] || 5),
      modelDefense: Number(row["Model Defense"] || 5), propUsage: Number(row["Prop Usage"] || 0.5), volatility: Number(row.Volatility || 1)
    };
  });
  players = normalizePlayers_(players);
  var assignments = [];
  rows_("Team Assignments").forEach(function(row) {
    var names = row.Player === "Berler/Jason" ? ["Berler", "Jason"] : [row.Player];
    names.forEach(function(name) {
      assignments.push({
        scenario: row.Scenario, teamId: row.Team, playerId: slug_(name), playerName: name,
        rotationShare: row.Player === "Berler/Jason" ? 0.5 : 1, notes: row.Notes || ""
      });
    });
  });
  var schedule = rows_("Schedule & Results").map(function(row) {
    return {
      gameId: row["Game ID"], team1: row["Team 1"] || "", team2: row["Team 2"] || "", bye: row.Bye || "", status: row.Status || "UPCOMING",
      team1Score: numberOrNull_(row["Team 1 Score"]), team2Score: numberOrNull_(row["Team 2 Score"]),
      final: bool_(row["Final?"]), bettingLocked: bool_(row["Betting Locked?"]), updatedAt: row["Updated At"] || ""
    };
  });
  var boxScores = rows_("Box Scores").map(function(row) {
    return {
      gameId: row["Game ID"], scenario: row.Scenario, playerId: row["Player ID"], playerName: row.Player,
      teamId: row.Team, played: bool_(row["Played?"]), points: Number(row.Points || 0), rebounds: Number(row.Rebounds || 0),
      assists: Number(row.Assists || 0), threes: Number(row["Three Pointers"] || 0)
    };
  });
  var bets = rows_("Bets").map(function(row) {
    return {
      betId: row["Bet ID"], submittedAt: row["Submitted At"], bettor: row.Bettor, stake: Number(row.Stake || 0),
      decimalOdds: Number(row["Decimal Odds"] || 0), americanOdds: Number(row["American Odds"] || 0),
      potentialReturn: Number(row["Potential Return"] || 0), scenario: row.Scenario, status: row.Status || "pending",
      settledReturn: Number(row["Settled Return"] || 0), profit: Number(row.Profit || 0),
      modelVersion: Number(row["Model Version"] || 0), eventId: row["Event ID"] || ""
    };
  });
  var betLegs = rows_("Bet Legs").map(function(row) {
    return {
      betId: row["Bet ID"], legNumber: Number(row["Leg #"]), gameId: row["Game ID"], kind: row.Kind,
      subject: row.Subject, playerId: row["Player ID"] || "", teamId: row.Team || "", stat: row.Stat || "",
      side: row.Side, line: numberOrNull_(row.Line), label: row.Label, odds: Number(row["Leg Decimal Odds"] || 0), grade: row.Grade || ""
    };
  });
  var participants = rows_("Participants").filter(function(row) { return row.Bettor && bool_(row["Active?"]); }).map(function(row) { return row.Bettor; });
  return { ok: true, config: config, players: players, assignments: assignments, schedule: schedule, boxScores: boxScores, bets: bets, betLegs: betLegs, participants: participants };
}

function index_(headers) {
  var result = {};
  headers.forEach(function(header, position) { result[header] = position; });
  return result;
}

function settleBets_() {
  var betSheet = sheet_("Bets");
  var legSheet = sheet_("Bet Legs");
  if (betSheet.getLastRow() < 2 || legSheet.getLastRow() < 2) return;
  var betValues = betSheet.getDataRange().getValues();
  var legValues = legSheet.getDataRange().getValues();
  var betIndex = index_(betValues[0]);
  var legIndex = index_(legValues[0]);

  var schedule = {};
  rows_("Schedule & Results").forEach(function(row) {
    var game = canonicalGame_(row["Game ID"]);
    schedule[row["Game ID"]] = {
      team1: game ? game.team1 : row["Team 1"], team2: game ? game.team2 : row["Team 2"], score1: numberOrNull_(row["Team 1 Score"]),
      score2: numberOrNull_(row["Team 2 Score"]), final: bool_(row["Final?"])
    };
  });
  var box = {};
  rows_("Box Scores").forEach(function(row) {
    if (!bool_(row["Played?"])) return;
    box[[row["Game ID"], row.Scenario, row["Player ID"]].join("|")] = {
      points: Number(row.Points || 0), rebounds: Number(row.Rebounds || 0), assists: Number(row.Assists || 0), threes: Number(row["Three Pointers"] || 0)
    };
  });
  var legsByBet = {};
  for (var legRow = 1; legRow < legValues.length; legRow++) {
    var legBetId = legValues[legRow][legIndex["Bet ID"]];
    if (!legsByBet[legBetId]) legsByBet[legBetId] = [];
    legsByBet[legBetId].push({ row: legRow, values: legValues[legRow] });
  }

  var changed = false;
  for (var betRow = 1; betRow < betValues.length; betRow++) {
    var betId = betValues[betRow][betIndex["Bet ID"]];
    var scenario = betValues[betRow][betIndex.Scenario];
    var grades = (legsByBet[betId] || []).map(function(entry) {
      var grade = gradeLeg_(entry.values, legIndex, schedule, box, scenario);
      if (entry.values[legIndex.Grade] !== grade) changed = true;
      entry.values[legIndex.Grade] = grade;
      return grade;
    });
    var status = "pending";
    var returned = 0;
    var stake = Number(betValues[betRow][betIndex.Stake] || 0);
    var potential = Number(betValues[betRow][betIndex["Potential Return"]] || 0);
    if (grades.indexOf("loss") >= 0) status = "lost";
    else if (grades.indexOf("pending") >= 0 || grades.length === 0) status = "pending";
    else if (grades.every(function(grade) { return grade === "push"; })) { status = "push"; returned = stake; }
    else { status = "won"; returned = potential; }
    var profit = status === "pending" ? 0 : returned - stake;
    if (betValues[betRow][betIndex.Status] !== status || Number(betValues[betRow][betIndex["Settled Return"]] || 0) !== returned) changed = true;
    betValues[betRow][betIndex.Status] = status;
    betValues[betRow][betIndex["Settled Return"]] = returned;
    betValues[betRow][betIndex.Profit] = profit;
  }
  if (changed) {
    betSheet.getRange(2, 1, betValues.length - 1, betValues[0].length).setValues(betValues.slice(1));
    legSheet.getRange(2, 1, legValues.length - 1, legValues[0].length).setValues(legValues.slice(1));
    SpreadsheetApp.flush();
  }
}

function compare_(value, line, side) {
  if (value === line) return "push";
  if (side === "over") return value > line ? "win" : "loss";
  return value < line ? "win" : "loss";
}

function gradeLeg_(row, index, schedule, box, scenario) {
  var game = schedule[row[index["Game ID"]]];
  if (!game || !game.final || game.score1 === null || game.score2 === null) return "pending";
  var kind = row[index.Kind];
  var side = row[index.Side];
  var line = numberOrNull_(row[index.Line]);
  var team = row[index.Team];
  function score(teamName) { return teamName === game.team1 ? game.score1 : game.score2; }
  if (kind === "moneyline") {
    var selected = side === "team1" ? game.team1 : game.team2;
    var opponent = selected === game.team1 ? game.team2 : game.team1;
    return score(selected) > score(opponent) ? "win" : "loss";
  }
  if (kind === "spread") {
    var spreadOpponent = team === game.team1 ? game.team2 : game.team1;
    var adjusted = score(team) + Number(line);
    if (adjusted === score(spreadOpponent)) return "push";
    return adjusted > score(spreadOpponent) ? "win" : "loss";
  }
  if (kind === "total") return compare_(game.score1 + game.score2, Number(line), side);
  if (kind === "team-total") return compare_(score(team), Number(line), side);
  if (kind === "player-prop") {
    var player = box[[row[index["Game ID"]], scenario, row[index["Player ID"]]].join("|")];
    if (!player) return "pending";
    var stat = row[index.Stat];
    var value = player[stat];
    if (stat === "pr") value = player.points + player.rebounds;
    if (stat === "pa") value = player.points + player.assists;
    if (stat === "ra") value = player.rebounds + player.assists;
    if (stat === "pra") value = player.points + player.rebounds + player.assists;
    return compare_(Number(value), Number(line), side);
  }
  return "pending";
}

function placeBet_(ticket) {
  if (!ticket || !ticket.id || !ticket.participant || !ticket.legs || !ticket.legs.length) throw new Error("Ticket is incomplete");
  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    var config = getConfig_();
    if (!bool_(config.BETTING_OPEN)) throw new Error("Central betting is closed");
    var expectedScenario = bool_(config.BRAD_PLAYS) ? "Brad Plays" : "Brad Out";
    if (ticket.scenario !== expectedScenario) throw new Error("Brad scenario changed; refresh the app before betting");
    var allowedParticipants = rows_("Participants").filter(function(row) { return row.Bettor && bool_(row["Active?"]); }).map(function(row) { return String(row.Bettor).trim(); });
    if (allowedParticipants.length && allowedParticipants.indexOf(String(ticket.participant).trim()) < 0) throw new Error("Bettor name is not active in the Participants sheet");
    var existing = rows_("Bets");
    if (existing.some(function(row) { return row["Bet ID"] === ticket.id; })) return { ok: true, duplicate: true };

    var startingUnits = Number(config.STARTING_UNITS || 100);
    var bettorRows = existing.filter(function(row) { return row.Bettor === ticket.participant; });
    var totalStake = bettorRows.reduce(function(sum, row) { return sum + Number(row.Stake || 0); }, 0);
    var totalReturns = bettorRows.reduce(function(sum, row) { return sum + Number(row["Settled Return"] || 0); }, 0);
    var available = startingUnits - totalStake + totalReturns;
    if (!(Number(ticket.stake) > 0) || Number(ticket.stake) > available + 0.0001) throw new Error("Stake exceeds shared bankroll");

    var locked = {};
    rows_("Schedule & Results").forEach(function(row) { locked[row["Game ID"]] = bool_(row["Betting Locked?"]); });
    ticket.legs.forEach(function(leg) { if (locked[leg.gameId]) throw new Error(leg.gameId + " is locked"); });

    sheet_("Bets").appendRow([
      ticket.id, new Date(), ticket.participant, Number(ticket.stake), Number(ticket.decimalOdds), Number(ticket.americanOdds),
      Number(ticket.potentialReturn), ticket.scenario, "pending", 0, 0, Number(config.MODEL_VERSION || 1), config.EVENT_ID || ""
    ]);
    var legSheet = sheet_("Bet Legs");
    ticket.legs.forEach(function(leg, index) {
      legSheet.appendRow([
        ticket.id, index + 1, leg.gameId, leg.kind, leg.subject, leg.playerId || "", leg.teamId || "", leg.stat || "",
        leg.side, leg.line === undefined ? "" : leg.line, leg.label, Number(leg.odds || 0), "pending"
      ]);
    });
    SpreadsheetApp.flush();
    return { ok: true, available: available - Number(ticket.stake) };
  } finally {
    lock.releaseLock();
  }
}
