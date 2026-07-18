"""Migrate an existing shared workbook to the flexible schedule/model schema."""

from copy import copy
from pathlib import Path
import sys

from openpyxl import load_workbook


MODEL_CONFIG = (
    ("STRAIGHT_VIG", 0.06, "Straight-market overround used for game lines and player props."),
    ("PARLAY_BASE_VIG", 0.08, "Base parlay margin applied after joint simulation pricing."),
    ("THREE_POINT_RATE_MIN", 0.22, "Minimum amateur pickup three-point attempt rate."),
    ("THREE_POINT_RATE_MAX", 0.55, "Maximum amateur pickup three-point attempt rate."),
    ("SCORING_USAGE_WEIGHT", 0.65, "How strongly scoring rating concentrates shot attempts."),
    ("SHOOTING_USAGE_WEIGHT", 0.18, "How strongly shooting rating concentrates shot attempts."),
    ("THREE_POINT_ATTEMPT_SHOOTING_WEIGHT", 0.04, "How strongly shooting rating changes three-point attempt mix."),
    ("THREE_POINT_ATTEMPT_USAGE_WEIGHT", 0.20, "How strongly player usage changes three-point attempt mix."),
    ("POINTS_MAKE_SKILL_SLOPE", 0.028, "Two-point make-probability sensitivity to individual skill."),
    ("THREE_POINT_MAKE_SKILL_SLOPE", 0.03, "Three-point make-probability sensitivity to shooting skill."),
    ("ASSIST_BASE_RATE", 0.40, "Base chance that a made basket receives an assist."),
    ("ASSIST_PLAYMAKING_SLOPE", 0.04, "Assist-rate increase per playmaking rating point."),
    ("ASSIST_ROLE_EXPONENT", 2.2, "How sharply high-playmaking players receive assist credit."),
    ("ASSIST_ROLE_WEIGHT", 1.4, "Strength of individual playmaking in assist-credit allocation."),
    ("OFFENSIVE_REBOUND_BASE_RATE", 0.28, "Base chance a miss becomes an offensive rebound."),
    ("REBOUND_ROLE_EXPONENT", 1.9, "How sharply high-rebounding players receive rebound credit."),
    ("REBOUND_ROLE_WEIGHT", 1.35, "Strength of individual rebounding in rebound allocation."),
)

DEPRECATED_CONFIG_KEYS = {
    "APPS_SCRIPT_URL", "AUTO_REFRESH_SECONDS",
    "REBOUND_LINE_QUANTILE", "ASSIST_LINE_QUANTILE", "THREES_LINE_QUANTILE",
    "POINTS_LINE_QUANTILE", "COMBO_LINE_QUANTILE",
}


def copy_row_style(sheet, source_row: int, target_row: int, columns: int) -> None:
    for column in range(1, columns + 1):
        source = sheet.cell(source_row, column)
        target = sheet.cell(target_row, column)
        target._style = copy(source._style)
        target.alignment = copy(source.alignment)
        target.number_format = source.number_format


def migrate(path: Path) -> None:
    workbook = load_workbook(path)

    config = workbook["App Config"]
    for row in range(config.max_row, 1, -1):
        if config.cell(row, 1).value in DEPRECATED_CONFIG_KEYS:
            config.delete_rows(row, 1)
    existing_keys = {config.cell(row, 1).value for row in range(2, config.max_row + 1)}
    for key, value, description in MODEL_CONFIG:
        if key in existing_keys:
            continue
        row = config.max_row + 1
        config.append([key, value, description, "Organizer"])
        copy_row_style(config, min(row - 1, 11), row, 4)
        config.cell(row, 2).fill = copy(config["B11"].fill)
    for key, value, _description, *legacy in MODEL_CONFIG:
        if not legacy:
            continue
        for row in range(2, config.max_row + 1):
            if config.cell(row, 1).value == key and config.cell(row, 2).value == legacy[0]:
                config.cell(row, 2).value = value
                break
    for row in range(2, config.max_row + 1):
        if config.cell(row, 1).value == "MODEL_VERSION" and (config.cell(row, 2).value or 0) < 4:
            config.cell(row, 2).value = 4
            break

    schedule = workbook["Schedule & Results"]
    headers = [schedule.cell(1, column).value for column in range(1, schedule.max_column + 1)]
    additions = [
        ("Game Type", "TOURNAMENT"),
        ("Team 1 ID", ""),
        ("Team 2 ID", ""),
        ("Bye ID", ""),
        ("Counts Toward Standings?", True),
        ("Betting Enabled?", True),
    ]
    for header, _ in additions:
        if header not in headers:
            schedule.cell(1, schedule.max_column + 1).value = header
            headers.append(header)
    columns = {header: index + 1 for index, header in enumerate(headers)}
    canonical = {
        "game-1": ("Team A", "Team B", "Team C"),
        "game-2": ("Team B", "Team C", "Team A"),
        "game-3": ("Team C", "Team A", "Team B"),
    }
    for row in range(2, schedule.max_row + 1):
        game_id = schedule.cell(row, columns["Game ID"]).value
        if not game_id:
            continue
        fallback = canonical.get(str(game_id), ("", "", ""))
        values = {
            "Game Type": schedule.cell(row, columns["Game Type"]).value or "TOURNAMENT",
            "Team 1 ID": schedule.cell(row, columns["Team 1 ID"]).value or fallback[0],
            "Team 2 ID": schedule.cell(row, columns["Team 2 ID"]).value or fallback[1],
            "Bye ID": schedule.cell(row, columns["Bye ID"]).value or fallback[2],
            "Counts Toward Standings?": schedule.cell(row, columns["Counts Toward Standings?"]).value if schedule.cell(row, columns["Counts Toward Standings?"]).value != "" else True,
            "Betting Enabled?": schedule.cell(row, columns["Betting Enabled?"]).value if schedule.cell(row, columns["Betting Enabled?"]).value != "" else True,
        }
        for header, value in values.items():
            schedule.cell(row, columns[header]).value = value

    if "Game Rosters" not in workbook.sheetnames:
        workbook.create_sheet("Game Rosters")
        roster = workbook["Game Rosters"]
        roster.append(["Game ID", "Roster Configuration", "Team ID", "Player", "Rotation Share", "Active?", "Notes"])
        for cell in roster[1]:
            cell.font = copy(schedule[1][0].font)
            cell.fill = copy(schedule[1][0].fill)
        roster.column_dimensions["A"].width = 13
        roster.column_dimensions["B"].width = 22
        roster.column_dimensions["C"].width = 13
        roster.column_dimensions["D"].width = 22
        roster.column_dimensions["E"].width = 16
        roster.column_dimensions["F"].width = 11
        roster.column_dimensions["G"].width = 42

    workbook.save(path)


if __name__ == "__main__":
    migrate(Path(sys.argv[1]))
