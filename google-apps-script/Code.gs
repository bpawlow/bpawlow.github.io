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
    .addItem("Remove a participant", "removeParticipantPrompt")
    .addToUi();
}

function removeParticipantPrompt() {
  var ui = SpreadsheetApp.getUi();
  var response = ui.prompt("Remove a participant", "Enter the exact participant name from the Participants tab. This works only when they have no bets.", ui.ButtonSet.OK_CANCEL);
  if (response.getSelectedButton() !== ui.Button.OK) return;
  var participant = String(response.getResponseText() || "").trim();
  if (!participant) { ui.alert("No participant name was entered."); return; }
  try {
    var result = removeParticipantByName_(participant);
    ui.alert(result.removed ? "Participant removed. The website will update on its next sync." : "No matching participant was found.");
  } catch (error) {
    ui.alert(String(error && error.message || error));
  }
}

function removeParticipantByName_(participant) {
  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    var normalized = participant.toLowerCase();
    var matchingBets = rows_("Bets").some(function(row) {
      return String(row.Bettor || "").trim().toLowerCase() === normalized;
    });
    if (matchingBets) throw new Error("This participant has bets. Delete those bets first, then remove the participant.");

    var sheet = sheet_("Participants");
    var values = sheet.getDataRange().getValues();
    var bettorColumn = values[0].indexOf("Bettor");
    for (var row = values.length - 1; row >= 1; row--) {
      if (String(values[row][bettorColumn] || "").trim().toLowerCase() === normalized) {
        sheet.deleteRow(row + 1);
        SpreadsheetApp.flush();
        return { removed: true };
      }
    }
    return { removed: false };
  } finally {
    lock.releaseLock();
  }
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

function optionalRows_(name) {
  return SpreadsheetApp.getActiveSpreadsheet().getSheetByName(name) ? rows_(name) : [];
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

function teamIdFromDisplay_(value, config) {
  var names = {
    "Team A": String(config.TEAM_A_NAME || "Team A"),
    "Team B": String(config.TEAM_B_NAME || "Team B"),
    "Team C": String(config.TEAM_C_NAME || "Team C")
  };
  return ["Team A", "Team B", "Team C"].find(function(team) { return team === value || names[team] === value; }) || "";
}

function getConfig_() {
  var config = {};
  rows_("App Config").forEach(function(row) { config[row.Key] = row.Value; });
  return config;
}

function ensureModelConfig_() {
  var configSheet = sheet_("App Config");
  var deprecated = {
    "APPS_SCRIPT_URL": true,
    "AUTO_REFRESH_SECONDS": true,
    "REBOUND_LINE_QUANTILE": true,
    "ASSIST_LINE_QUANTILE": true,
    "THREES_LINE_QUANTILE": true,
    "POINTS_LINE_QUANTILE": true,
    "COMBO_LINE_QUANTILE": true
  };
  var sheetValues = configSheet.getDataRange().getValues();
  var keyColumn = sheetValues[0].indexOf("Key");
  for (var row = sheetValues.length - 1; row >= 1; row--) {
    if (deprecated[sheetValues[row][keyColumn]]) configSheet.deleteRow(row + 1);
  }
  var rows = rows_("App Config");
  var existing = {};
  rows.forEach(function(row) { existing[row.Key] = row.Value; });
  var modelRows = [
    ["THREE_POINT_RATE_MIN", 0.22, "Minimum amateur pickup three-point attempt rate."],
    ["THREE_POINT_RATE_MAX", 0.55, "Maximum amateur pickup three-point attempt rate."],
    ["SCORING_USAGE_WEIGHT", 0.65, "How strongly scoring rating concentrates shot attempts."],
    ["SHOOTING_USAGE_WEIGHT", 0.18, "How strongly shooting rating concentrates shot attempts."],
    ["THREE_POINT_ATTEMPT_SHOOTING_WEIGHT", 0.04, "How strongly shooting rating changes three-point attempt mix."],
    ["THREE_POINT_ATTEMPT_USAGE_WEIGHT", 0.20, "How strongly player usage changes three-point attempt mix."],
    ["POINTS_MAKE_SKILL_SLOPE", 0.028, "Two-point make-probability sensitivity to individual skill."],
    ["THREE_POINT_MAKE_SKILL_SLOPE", 0.03, "Three-point make-probability sensitivity to shooting skill."],
    ["ASSIST_BASE_RATE", 0.40, "Base chance that a made basket receives an assist."],
    ["ASSIST_PLAYMAKING_SLOPE", 0.04, "Assist-rate increase per playmaking rating point."],
    ["ASSIST_ROLE_EXPONENT", 2.2, "How sharply high-playmaking players receive assist credit."],
    ["ASSIST_ROLE_WEIGHT", 1.4, "Strength of individual playmaking in assist-credit allocation."],
    ["OFFENSIVE_REBOUND_BASE_RATE", 0.28, "Base chance a miss becomes an offensive rebound."],
    ["REBOUND_ROLE_EXPONENT", 1.9, "How sharply high-rebounding players receive rebound credit."],
    ["REBOUND_ROLE_WEIGHT", 1.35, "Strength of individual rebounding in rebound allocation."]
  ];
  modelRows.forEach(function(item) {
    if (existing[item[0]] === undefined || existing[item[0]] === "") {
      configSheet.appendRow([item[0], item[1], item[2], "Organizer"]);
      return;
    }
    // Migrate only values that exactly match the old untouched defaults.
    // Any organizer-customized value is preserved.
    if (item[3] !== undefined && Number(existing[item[0]]) === Number(item[3])) {
      var values = configSheet.getDataRange().getValues();
      var keyColumn = values[0].indexOf("Key");
      var valueColumn = values[0].indexOf("Value");
      for (var row = 1; row < values.length; row++) {
        if (values[row][keyColumn] === item[0]) {
          configSheet.getRange(row + 1, valueColumn + 1).setValue(item[1]);
          break;
        }
      }
    }
  });
  var config = getConfig_();
  if (config.MODEL_VERSION !== undefined && Number(config.MODEL_VERSION) < 4) {
    var values = configSheet.getDataRange().getValues();
    var keyColumn = values[0].indexOf("Key");
    var valueColumn = values[0].indexOf("Value");
    for (var row = 1; row < values.length; row++) {
      if (values[row][keyColumn] === "MODEL_VERSION") {
        configSheet.getRange(row + 1, valueColumn + 1).setValue(4);
        break;
      }
    }
  }
}

function canonicalGame_(gameId) {
  var games = {
    "game-1": { team1: "Team A", team2: "Team B", bye: "Team C" },
    "game-2": { team1: "Team B", team2: "Team C", bye: "Team A" },
    "game-3": { team1: "Team C", team2: "Team A", bye: "Team B" }
  };
  return games[String(gameId || "")] || null;
}

function ensureScheduleSchema_() {
  var sheet = sheet_("Schedule & Results");
  var required = ["Game #", "Game Type", "Team 1 ID", "Team 2 ID", "Bye ID", "Counts Toward Standings?", "Betting Enabled?"];
  var values = sheet.getDataRange().getValues();
  var headers = values[0] || [];
  required.forEach(function(header) {
    if (headers.indexOf(header) >= 0) return;
    sheet.getRange(1, sheet.getLastColumn() + 1).setValue(header);
    headers.push(header);
  });
  values = sheet.getDataRange().getValues();
  headers = values[0];
  var columns = index_(headers);
  var config = getConfig_();
  for (var row = 1; row < values.length; row++) {
    if (!values[row][columns["Game ID"]]) continue;
    var legacy = canonicalGame_(values[row][columns["Game ID"]]);
    var team1Id = values[row][columns["Team 1 ID"]] || (legacy && legacy.team1) || teamIdFromDisplay_(values[row][columns["Team 1"]], config);
    var team2Id = values[row][columns["Team 2 ID"]] || (legacy && legacy.team2) || teamIdFromDisplay_(values[row][columns["Team 2"]], config);
    var byeId = values[row][columns["Bye ID"]] || (legacy && legacy.bye) || teamIdFromDisplay_(values[row][columns.Bye], config);
    var updates = {};
    updates["Game #"] = values[row][columns["Game #"]] || row;
    updates["Game Type"] = values[row][columns["Game Type"]] || "TOURNAMENT";
    updates["Team 1 ID"] = team1Id;
    updates["Team 2 ID"] = team2Id;
    updates["Bye ID"] = byeId;
    updates["Counts Toward Standings?"] = values[row][columns["Counts Toward Standings?"]] === "" ? true : values[row][columns["Counts Toward Standings?"]];
    updates["Betting Enabled?"] = values[row][columns["Betting Enabled?"]] === "" ? true : values[row][columns["Betting Enabled?"]];
    Object.keys(updates).forEach(function(header) {
      if (values[row][columns[header]] !== updates[header]) sheet.getRange(row + 1, columns[header] + 1).setValue(updates[header]);
    });
  }
}

function syncTeamNames_() {
  var configSheet = sheet_("App Config");
  var config = getConfig_();
  ensureScheduleSchema_();
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
    var team1 = values[row][columns["Team 1 ID"]];
    var team2 = values[row][columns["Team 2 ID"]];
    var bye = values[row][columns["Bye ID"]];
    if (!team1 || !team2) continue;
    var nextNames = [names[team1], names[team2], bye ? names[bye] : ""];
    [["Team 1", nextNames[0]], ["Team 2", nextNames[1]], ["Bye", nextNames[2]]].forEach(function(item) {
      if (values[row][columns[item[0]]] !== item[1]) scheduleSheet.getRange(row + 1, columns[item[0]] + 1).setValue(item[1]);
    });
  }
}

function ensureBoxScoreRows_(assignments) {
  var boxSheet = sheet_("Box Scores");
  var values = boxSheet.getDataRange().getValues();
  if (values.length < 1) return;
  var headers = values[0];
  var columns = index_(headers);
  var existing = {};
  values.slice(1).forEach(function(row) {
    if (row[columns["Game ID"]] && row[columns.Scenario] && row[columns["Player ID"]]) {
      existing[[row[columns["Game ID"]], row[columns.Scenario], row[columns["Player ID"]]].join("|")] = true;
    }
  });
  var schedule = rows_("Schedule & Results");
  var scenarios = ["Brad Out", "Brad Plays"];
  schedule.forEach(function(game) {
    scenarios.forEach(function(scenario) {
      var specific = assignments.filter(function(item) { return item.gameId === game["Game ID"] && item.scenario === scenario; });
      var roster = specific.length ? specific : assignments.filter(function(item) { return !item.gameId && item.scenario === scenario; });
      roster.forEach(function(item) {
        var key = [game["Game ID"], scenario, item.playerId].join("|");
        if (existing[key]) return;
        var row = new Array(headers.length).fill("");
        row[columns["Game ID"]] = game["Game ID"];
        row[columns.Scenario] = scenario;
        row[columns["Player ID"]] = item.playerId;
        row[columns.Player] = item.playerName;
        row[columns.Team] = item.teamId;
        row[columns["Played?"]] = false;
        boxSheet.appendRow(row);
        var newRow = boxSheet.getLastRow();
        if (columns.PRA !== undefined) boxSheet.getRange(newRow, columns.PRA + 1).setFormula('=IF(F' + newRow + ',SUM(G' + newRow + ':I' + newRow + '),"")');
        existing[key] = true;
      });
    });
  });
}

function getState_() {
  ensureModelConfig_();
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
  optionalRows_("Game Rosters").forEach(function(row) {
    var scenario = row["Roster Configuration"] === "ALTERNATE" ? "Brad Plays" : (row.Scenario || "Brad Out");
    var names = row.Player === "Berler/Jason" ? ["Berler", "Jason"] : [row.Player];
    names.filter(Boolean).forEach(function(name) {
      assignments.push({ scenario: scenario, teamId: row.Team || row["Team ID"], gameId: row["Game ID"], playerId: slug_(name), playerName: name, rotationShare: Number(row["Rotation Share"] || 1), notes: row.Notes || "" });
    });
  });
  ensureBoxScoreRows_(assignments);
  var schedule = rows_("Schedule & Results").map(function(row) {
    return {
      gameId: row["Game ID"], number: Number(row["Game #"] || 0), type: row["Game Type"] || "TOURNAMENT",
      team1Id: row["Team 1 ID"] || teamIdFromDisplay_(row["Team 1"] || "", config), team2Id: row["Team 2 ID"] || teamIdFromDisplay_(row["Team 2"] || "", config), byeId: row["Bye ID"] || (row.Bye ? teamIdFromDisplay_(row.Bye, config) : null),
      team1: row["Team 1"] || "", team2: row["Team 2"] || "", bye: row.Bye || "", countsTowardStandings: bool_(row["Counts Toward Standings?"]), bettingEnabled: bool_(row["Betting Enabled?"]), status: row.Status || "UPCOMING",
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
      team1: row["Team 1 ID"] || (game ? game.team1 : row["Team 1"]), team2: row["Team 2 ID"] || (game ? game.team2 : row["Team 2"]), score1: numberOrNull_(row["Team 1 Score"]),
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

function validateTicketLegs_(ticket) {
  var groups = {};
  ticket.legs.forEach(function(leg) {
    var group = [leg.gameId, leg.kind, leg.playerId || "", leg.stat || ""].join("|");
    if (groups[group]) throw new Error("A ticket cannot contain duplicate or opposite selections from the same market");
    groups[group] = true;
  });
  ticket.legs.forEach(function(leg) {
    if (leg.kind !== "spread" || Number(leg.line) >= 0 || !leg.teamId) return;
    var impossible = ticket.legs.some(function(other) {
      return other.gameId === leg.gameId && other.kind === "moneyline" && other.teamId && other.teamId !== leg.teamId;
    });
    if (impossible) throw new Error("A favorite spread and the opposing moneyline cannot both be selected");
  });
}

function placeBet_(ticket) {
  if (!ticket || !ticket.id || !ticket.participant || !ticket.legs || !ticket.legs.length) throw new Error("Ticket is incomplete");
  validateTicketLegs_(ticket);
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
    rows_("Schedule & Results").forEach(function(row) { locked[row["Game ID"]] = bool_(row["Betting Locked?"]) || (row["Betting Enabled?"] !== undefined && row["Betting Enabled?"] !== "" && !bool_(row["Betting Enabled?"])); });
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
