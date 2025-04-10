import {
    doNewChat,
    addOneMessage,
    saveChatConditional,
    chat as globalChat, // The currently active chat array
    this_chid,
    is_send_press,
    isChatSaving,
} from "../../../../script.js";
import {
    getContext 
} from '../../../extensions.js';
import {
    selected_group,
    is_group_generating
} from "../../../group-chats.js";
// Optionally import toastr for user feedback
import { toastr } from '../../../../lib/toastr.js';

const extensionName = "fill-specific-chat";
const logPrefix = `[${extensionName}]`; // Prefix for console logs

// The specific mesids we want to copy
const MESIDS_TO_COPY = [1, 3, 7];

/**
 * The main function triggered by the button click.
 */
async function handleFillButtonClick() {
    console.log(`${logPrefix} '[填充]'按钮被点击。`);

    const context = getContext();

    // --- Safety Checks ---
    const currentCharacterId = this_chid;
    const currentGroupId = selected_group;

    if (currentGroupId === null && currentCharacterId === undefined) {
        console.warn(`${logPrefix} 没有选中的角色或群组。操作中止。`);
        toastr.warning("请先选择一个角色或群组。");
        return;
    }

    if (is_send_press || is_group_generating) {
        console.warn(`${logPrefix} 正在生成回复。操作中止。`);
        toastr.warning("正在生成回复，请稍后再试。");
        return;
    }
    if (isChatSaving) {
        console.warn(`${logPrefix} 聊天正在保存。操作中止。`);
        toastr.warning("聊天正在保存，请稍后再试。");
        return;
    }

    const targetEntity = currentGroupId ? `群组 ${currentGroupId}` : `角色 ${currentCharacterId}`;
    console.log(`${logPrefix} 当前目标: ${targetEntity}`);

    // --- Get Current Chat Data (BEFORE creating new chat) ---
    // !! CRITICAL: Make a copy of the current chat message array !!
    const currentChatMessages = [...globalChat];
    console.log(`${logPrefix} 获取到当前聊天消息 ${currentChatMessages.length} 条。`);

    if (currentChatMessages.length === 0) {
        console.log(`${logPrefix} 当前聊天为空，无法复制消息。`);
        toastr.info("当前聊天没有消息可以复制。");
        // Decide if you still want to create an empty new chat or stop.
        // Let's stop here for clarity.
        // return;
        // Or, create an empty chat anyway:
        try {
            console.log(`${logPrefix} 即使没有消息可复制，也尝试创建新聊天...`);
            await doNewChat({ deleteCurrentChat: false });
            console.log(`${logPrefix} 为 ${targetEntity} 创建了一个空的新聊天。`);
            toastr.success(`为 ${targetEntity} 创建了一个空的新聊天！`);
        } catch(error) {
            console.error(`${logPrefix} 创建空的新聊天时出错:`, error);
            toastr.error("创建新聊天时出错。");
        }
        return; // Exit after creating empty chat
    }

    // --- Identify Specific Messages to Copy (Based on mesid/original index) ---
    const messagesToCopy = [];
    console.log(`${logPrefix} 尝试查找 mesid 为 ${MESIDS_TO_COPY.join(', ')} 的消息...`);

    for (const mesId of MESIDS_TO_COPY) {
        // In SillyTavern, the 'mesid' attribute on the DOM usually corresponds
        // to the original index of the message in the 'chat' array when it was added.
        // We access our *copy* of the chat array using this index.
        if (mesId >= 0 && mesId < currentChatMessages.length) {
            const messageObject = currentChatMessages[mesId];
            if (messageObject) {
                console.log(`${logPrefix} 找到 mesid ${mesId} 对应的消息对象:`, { name: messageObject.name, is_user: messageObject.is_user, mes_preview: messageObject.mes.substring(0, 50) + '...' });
                messagesToCopy.push({ ...messageObject }); // Add a copy
            } else {
                // This case is less likely if the index is valid, but good practice
                console.warn(`${logPrefix} 索引 ${mesId} 在当前聊天消息数组中有效，但消息对象未定义？跳过。`);
            }
        } else {
            console.warn(`${logPrefix} mesid ${mesId} 超出当前聊天消息数组范围 (0-${currentChatMessages.length - 1})。无法复制此消息。`);
        }
    }

    if (messagesToCopy.length === 0) {
        console.log(`${logPrefix} 未找到任何指定 mesid (${MESIDS_TO_COPY.join(', ')}) 的有效消息。`);
        toastr.info(`在当前聊天中未找到 mesid 为 ${MESIDS_TO_COPY.join(', ')} 的消息。将只创建新聊天。`);
         // Create an empty chat anyway
        try {
            console.log(`${logPrefix} 尝试创建新聊天 (无消息复制)...`);
            await doNewChat({ deleteCurrentChat: false });
            console.log(`${logPrefix} 为 ${targetEntity} 创建了一个空的新聊天。`);
            toastr.success(`为 ${targetEntity} 创建了一个空的新聊天！`);
        } catch(error) {
            console.error(`${logPrefix} 创建空的新聊天时出错:`, error);
            toastr.error("创建新聊天时出错。");
        }
        return; // Exit
    }

    console.log(`${logPrefix} 共找到 ${messagesToCopy.length} 条指定的消息准备复制。`);

    // --- Create New Chat and Add Messages ---
    try {
        console.log(`${logPrefix} 正在为 ${targetEntity} 创建新聊天...`);
        // This function creates the new chat, switches the UI, and updates globalChat
        await doNewChat({ deleteCurrentChat: false });
        console.log(`${logPrefix} 新聊天已为 ${targetEntity} 创建并激活。`);
        toastr.success(`新聊天已为 ${targetEntity} 创建并激活！`);

        console.log(`${logPrefix} 开始将 ${messagesToCopy.length} 条选定消息添加到新聊天中...`);
        // The 'globalChat' variable now points to the *new* chat's array

        for (const message of messagesToCopy) {
            // addOneMessage adds to the *current* globalChat and renders to DOM
            // We pass a copy just to be safe.
            console.log(`${logPrefix} 添加消息 (来自原 mesid ${message.swipe_id ?? message.mesid ?? 'N/A'}): ${message.name} - ${message.mes.substring(0, 30)}...`);
            await addOneMessage(message, { scroll: false }); // Add without scrolling each time
        }
        console.log(`${logPrefix} 所有选定消息已添加到新聊天界面。`);

        // Optional: Scroll to bottom after adding all messages
        // context.scrollToBottom(); // Or find the function/method to do this

        console.log(`${logPrefix} 正在保存包含已复制消息的新聊天...`);
        await saveChatConditional(); // Save the new chat with the added messages
        console.log(`${logPrefix} 新聊天已保存。`);
        toastr.success(`已将 ${messagesToCopy.length} 条特定消息填充到新聊天并保存！`);

    } catch (error) {
        console.error(`${logPrefix} 在创建新聊天或填充消息时发生错误:`, error);
        toastr.error("创建或填充新聊天时出错，请查看控制台日志。");
    }
}

/**
 * Plugin Initialization Logic (runs when SillyTavern loads)
 */
jQuery(async () => {
    // Create the button HTML
    const buttonHtml = `
        <div id="fill_specific_chat_button_container">
            <button id="fill_specific_chat_button" title="根据预设规则填充新聊天">
                <i class="fa-solid fa-paste"></i> 填充
            </button>
        </div>
    `;

    // Append the button to the body (or a more specific container if preferred)
    // Fixed positioning in CSS handles placement.
    $('body').append(buttonHtml);

    // Add click listener to the button
    $('#fill_specific_chat_button').on('click', handleFillButtonClick);

    console.log(`${logPrefix} 插件已加载，[填充] 按钮已添加到界面。`);
});
