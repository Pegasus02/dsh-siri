#!/usr/bin/env python3
"""Build the "Hey DSH" iPhone Shortcut as an unsigned .shortcut file.

First use is handled by the Shortcut's import questions: iOS asks for the
server address, the API key and (optionally) a DS Bot name when the shortcut
is added, and stores them in three Text actions.

    python3 scripts/make-shortcut.py            # writes shortcuts/Hey DSH.unsigned.shortcut
    shortcuts sign -m anyone -i "shortcuts/Hey DSH.unsigned.shortcut" -o "shortcuts/Hey DSH.shortcut"
"""
import plistlib
import sys
import uuid
from pathlib import Path

OBJ = "￼"  # object replacement character: a variable sits here in a token string


def token(text, attachments=None):
    """A WFTextTokenString. attachments: {offset: (action_uuid, output_name)}"""
    value = {"string": text}
    if attachments:
        value["attachmentsByRange"] = {
            "{%d, 1}" % offset: {"OutputName": name, "OutputUUID": uid, "Type": "ActionOutput"}
            for offset, (uid, name) in attachments.items()
        }
    return {"Value": value, "WFSerializationType": "WFTextTokenString"}


def output(uid, name):
    """A single action output used as a parameter value."""
    return {
        "Value": {"OutputName": name, "OutputUUID": uid, "Type": "ActionOutput"},
        "WFSerializationType": "WFTextTokenAttachment",
    }


def dictionary(items):
    return {
        "Value": {"WFDictionaryFieldValueItems": [
            {"WFItemType": 0, "WFKey": token(key), "WFValue": value} for key, value in items
        ]},
        "WFSerializationType": "WFDictionaryFieldValue",
    }


def action(identifier, params):
    return {"WFWorkflowActionIdentifier": identifier, "WFWorkflowActionParameters": params}


url_id, key_id, bot_id, dictate_id, call_id, reply_id = (str(uuid.uuid4()).upper() for _ in range(6))

actions = [
    # 0-2: the three values asked for on first use (import questions point at these)
    action("is.workflow.actions.gettext", {
        "UUID": url_id, "CustomOutputName": "接口地址", "WFTextActionText": "http://你的地址:8000/siri"}),
    action("is.workflow.actions.gettext", {
        "UUID": key_id, "CustomOutputName": "密钥", "WFTextActionText": "粘贴设置页里的密钥"}),
    action("is.workflow.actions.gettext", {
        "UUID": bot_id, "CustomOutputName": "DS Bot", "WFTextActionText": ""}),
    # 3: listen
    action("is.workflow.actions.dictatetext", {"UUID": dictate_id, "CustomOutputName": "听写内容"}),
    # 4: POST {"text": ..., "bot": ...} with the bearer key
    action("is.workflow.actions.downloadurl", {
        "UUID": call_id,
        "WFURL": token(OBJ, {0: (url_id, "接口地址")}),
        "WFHTTPMethod": "POST",
        "WFHTTPBodyType": "JSON",
        "WFHTTPHeaders": dictionary([
            ("Authorization", token("Bearer " + OBJ, {7: (key_id, "密钥")})),
        ]),
        "WFJSONValues": dictionary([
            ("text", token(OBJ, {0: (dictate_id, "听写内容")})),
            ("bot", token(OBJ, {0: (bot_id, "DS Bot")})),
        ]),
    }),
    # 5: take "reply" out of the response
    action("is.workflow.actions.getvalueforkey", {
        "UUID": reply_id,
        "WFDictionaryKey": "reply",
        "WFInput": output(call_id, "URL 的内容"),
    }),
    # 6: read it aloud
    action("is.workflow.actions.speaktext", {"WFText": token(OBJ, {0: (reply_id, "字典值")})}),
]

questions = [
    {"ParameterKey": "WFTextActionText", "Category": "Parameter", "ActionIndex": 0,
     "Text": "接口地址：在 DSH 设置的“Siri 语音”页复制，形如 http://地址:8000/siri",
     "DefaultValue": "http://你的地址:8000/siri"},
    {"ParameterKey": "WFTextActionText", "Category": "Parameter", "ActionIndex": 1,
     "Text": "密钥：在 DSH 设置的“Siri 语音”页点“显示”再复制",
     "DefaultValue": ""},
    {"ParameterKey": "WFTextActionText", "Category": "Parameter", "ActionIndex": 2,
     "Text": "要对话的 DS Bot 名称（可留空，留空则用设置页里绑定的）",
     "DefaultValue": ""},
]

workflow = {
    "WFWorkflowActions": actions,
    "WFWorkflowClientVersion": "2900",
    "WFWorkflowMinimumClientVersion": 900,
    "WFWorkflowMinimumClientVersionString": "900",
    "WFWorkflowIcon": {"WFWorkflowIconStartColor": 4292093695, "WFWorkflowIconGlyphNumber": 59511},
    "WFWorkflowImportQuestions": questions,
    "WFWorkflowInputContentItemClasses": [],
    "WFWorkflowTypes": [],
}

out = Path(sys.argv[1] if len(sys.argv) > 1 else "shortcuts/Hey DSH.unsigned.shortcut")
out.parent.mkdir(parents=True, exist_ok=True)
out.write_bytes(plistlib.dumps(workflow, fmt=plistlib.FMT_BINARY))
print("wrote", out)
