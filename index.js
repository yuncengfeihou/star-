// chat-filler-plugin/index.js
// ═════════════════════════════════════════════════════════════════════════
// 聊天填充插件 (Chat Filler Plugin) v1.0.1
// 功能: 在“扩展”页面添加设置区域，包含一个按钮，点击后获取当前聊天中
//       特定索引的消息，创建新聊天并填充这些消息。
// ═════════════════════════════════════════════════════════════════════════

// --- 核心 SillyTavern 函数导入 ---
import {
    // 聊天操作
    doNewChat,
    addOneMessage,
    saveChatConditional,
    // 上下文与状态    
    chat as globalChat,
    this_chid,
    is_send_press,
    isChatSaving,
} from "../../../../script.js";

import {
    getContext 
    // 如果还需要 extension_settings 或 renderExtensionTemplateAsync，也放在这里
} from '../../../extensions.js';

// --- 群组聊天相关导入 ---
import {
    selected_group,
    is_group_generating
} from "../../../group-chats.js";

// --- 扩展模板加载 ---
import { renderExtensionTemplateAsync } from '../../../extensions.js';

// --- Toastr 通知库 ---
// import { toastr } from '../../../../lib/toastr.js';

// --- 插件常量 ---
const extensionName = "star0";
const logPrefix = `[${extensionName}]`;
const pluginFolderName = 'chat-filler-plugin'; // <--- 必须与你的插件文件夹名一致!

// --- 要填充的消息的索引 (基于 0 的数组索引) ---
const TARGET_MESSAGE_INDICES = [1, 3, 7];

// 核心功能：处理填充按钮点击事件 (函数本身逻辑不变)
async function handleFillButtonClick() {
    console.log(`${logPrefix} 设置页面内的填充按钮被点击。`);

    const context = getContext();

    // --- 1. 状态检查 ---
    console.log(`${logPrefix} 开始状态检查...`);
    if (selected_group === null && this_chid === undefined) {
        toastr.warning("请先选择一个角色或群组。");
        console.warn(`${logPrefix} 状态检查失败：没有选择角色或群组。`);
        return;
    }
    if (is_send_press || is_group_generating || isChatSaving) {
        toastr.warning("当前正在生成回复或保存聊天，请稍后再试。");
        console.warn(`${logPrefix} 状态检查失败：正在生成或保存中。`);
        return;
    }
    const currentEntity = selected_group ? `群组 ${selected_group}` : `角色 ${this_chid}`;
    console.log(`${logPrefix} 状态检查通过。当前实体: ${currentEntity}`);

    // --- 2. 获取并保存旧聊天信息 ---
    console.log(`${logPrefix} 获取旧聊天信息...`);
    const oldChatId = context.getCurrentChatId();
    const oldChatMessages = [...globalChat]; // 完整副本

    if (!oldChatMessages || oldChatMessages.length === 0) {
        toastr.info("当前聊天是空的，无法提取消息。将只创建新聊天。");
        console.log(`${logPrefix} 旧聊天为空，无法提取消息。`);
        try {
            console.log(`${logPrefix} 尝试仅创建新聊天...`);
            await doNewChat({ deleteCurrentChat: false });
            toastr.success("新聊天已创建！");
            console.log(`${logPrefix} 空聊天情况下，新聊天创建成功。`);
        } catch (error) {
            toastr.error("创建新聊天时出错。");
            console.error(`${logPrefix} 空聊天情况下，创建新聊天失败:`, error);
        }
        return;
    }
    console.log(`${logPrefix} 旧聊天信息获取成功。旧聊天 ID: ${oldChatId}, 共 ${oldChatMessages.length} 条消息。`);
    console.log(`${logPrefix} 目标消息索引 (基于0): ${TARGET_MESSAGE_INDICES.join(', ')}`);

    // --- 3. 筛选需要复制的消息 ---
    console.log(`${logPrefix} 开始筛选目标消息...`);
    const messagesToCopy = [];
    for (const index of TARGET_MESSAGE_INDICES) {
        if (index >= 0 && index < oldChatMessages.length) {
            const message = oldChatMessages[index];
            messagesToCopy.push(message);
            console.log(`${logPrefix}  - 找到索引 ${index} 的消息:`, message);
        } else {
            console.warn(`${logPrefix}  - 警告：索引 ${index} 超出当前聊天范围 (0-${oldChatMessages.length - 1})，将跳过。`);
        }
    }
    if (messagesToCopy.length === 0) {
        toastr.warning("在当前聊天中未找到任何指定索引的消息。");
        console.warn(`${logPrefix} 未找到任何有效索引的消息，操作中止。`);
        return;
    }
    console.log(`${logPrefix} 筛选完成，找到 ${messagesToCopy.length} 条要复制的消息。`);

    // --- 4. 执行聊天创建与填充 ---
    try {
        console.log(`${logPrefix} 开始创建新聊天...`);
        await doNewChat({ deleteCurrentChat: false });
        toastr.success("新聊天已创建并激活！");
        console.log(`${logPrefix} 新聊天创建并激活成功。当前实体: ${currentEntity}`);

        console.log(`${logPrefix} 开始将 ${messagesToCopy.length} 条筛选出的消息填充到新聊天...`);
        for (let i = 0; i < messagesToCopy.length; i++) {
            const message = messagesToCopy[i];
            const messageToAdd = { ...message };
            console.log(`${logPrefix}  - 正在添加第 ${i + 1}/${messagesToCopy.length} 条消息 (原索引 ${TARGET_MESSAGE_INDICES.find(idx => oldChatMessages[idx] === message)}):`, messageToAdd.mes);
            await addOneMessage(messageToAdd, { scroll: false });
        }
        console.log(`${logPrefix} 所有目标消息已添加到新聊天界面。`);

        console.log(`${logPrefix} 开始保存包含填充消息的新聊天...`);
        await saveChatConditional();
        toastr.success(`成功将 ${messagesToCopy.length} 条指定消息填充到新聊天并保存！`);
        console.log(`${logPrefix} 新聊天保存成功。`);

    } catch (error) {
        toastr.error("处理聊天创建或填充时发生错误。请查看控制台日志。");
        console.error(`${logPrefix} 创建或填充聊天时出错:`, error);
    }
}

// 插件 UI 初始化
jQuery(async () => {
    console.log(`${logPrefix} 开始初始化插件 UI (注入设置页面)...`);
    try {
        // --- 注入到扩展页面 ---
        // 加载 HTML 模板内容
        // 第一个参数: 'third-party/你的插件文件夹名'
        // 第二个参数: HTML 文件名 (!!! 不需要 .html 后缀 !!!)
        const settingsHtml = await renderExtensionTemplateAsync(`third-party/${pluginFolderName}`, 'settings_display');

        // 将加载的 HTML 追加到 ST 的扩展设置区域
        // 尝试 '#translation_container'，这是较新版本 ST 常用的区域
        // 如果不行，可以回退尝试 '#extensions_settings'
        const targetContainer = '#translation_container'; // 或者 '#extensions_settings'
        $(targetContainer).append(settingsHtml);
        console.log(`${logPrefix} 插件设置界面已添加至 ${targetContainer}`);

        // 为设置界面中的新按钮绑定点击事件
        // 注意按钮 ID 变更为 'my-plugin-fill-button-settings'
        $('#my-plugin-fill-button-settings').on('click', handleFillButtonClick);
        console.log(`${logPrefix} 设置页面内的填充按钮点击事件已绑定。`);

        console.log(`${logPrefix} 插件 UI 初始化完成。`);

    } catch (error) {
        console.error(`${logPrefix} 初始化插件 UI 时出错:`, error);
        toastr.error("聊天填充插件 UI 初始化失败，请检查控制台。");
    }
});

console.log(`${logPrefix} 插件脚本已加载。`);
