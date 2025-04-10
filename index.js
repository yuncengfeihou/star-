import {
    // 聊天操作
    doNewChat,              // 创建新聊天
    addOneMessage,          // 添加单条消息到当前聊天
    saveChatConditional,    // 条件性保存当前聊天
    // 上下文与状态
    chat as globalChat,     // 当前活动聊天记录数组 (会随切换变化)
    this_chid,              // 当前角色 ID
    is_send_press,          // 检查角色是否正在生成
    isChatSaving,           // 检查聊天是否正在保存
    // UI 与工具
    // (可选) 如果需要更复杂的加载提示，可以导入 showLoader/hideLoader
} from "../../../../script.js";

import {
    getContext 
    // 如果还需要 extension_settings 或 renderExtensionTemplateAsync，也放在这里
} from '../../../extensions.js';

// --- 群组聊天相关导入 ---
import {
    selected_group,         // 当前群组 ID
    is_group_generating     // 检查群组是否正在生成
} from "../../../group-chats.js";

// --- Toastr 通知库 ---
// 注意：SillyTavern 通常已全局加载 toastr，但显式导入更清晰
// import { toastr } from '../../../../lib/toastr.js';
// 如果上面导入无效或报错，尝试直接使用全局的 toastr

// --- 插件常量 ---
const extensionName = "star-"; // 与文件夹名称一致
const extensionFolderPath = `scripts/extensions/third-party/${extensionName}`;
const logPrefix = `[${extensionName}]`; // 日志前缀

// --- 要填充的消息的索引 (基于 0 的数组索引) ---
// 注意：用户请求的是 mesid 1, 3, 7。在未删除消息的理想情况下，这对应数组索引 1, 3, 7。
// 我们假设用户指的是数组索引，因为 mesid 本身可能不连续且不直接存储在 chat 数组中。
const TARGET_MESSAGE_INDICES = [0, 2, 3];

/**
 * 核心功能：处理填充按钮点击事件
 */
async function handleFillButtonClick() {
    console.log(`${logPrefix} 填充按钮被点击。`);

    const context = getContext(); // 获取当前上下文

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
    const oldChatId = context.getCurrentChatId(); // 获取旧聊天的 ID (主要用于日志)
    // !! 创建旧聊天消息数组的完整副本，这是关键 !!
    const oldChatMessages = [...globalChat];

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
        return; // 结束流程
    }

    console.log(`${logPrefix} 旧聊天信息获取成功。旧聊天 ID: ${oldChatId}, 共 ${oldChatMessages.length} 条消息。`);
    console.log(`${logPrefix} 目标消息索引 (基于0): ${TARGET_MESSAGE_INDICES.join(', ')}`);

    // --- 3. 筛选需要复制的消息 ---
    console.log(`${logPrefix} 开始筛选目标消息...`);
    const messagesToCopy = [];
    for (const index of TARGET_MESSAGE_INDICES) {
        if (index >= 0 && index < oldChatMessages.length) {
            // 索引有效，获取该消息
            const message = oldChatMessages[index];
            messagesToCopy.push(message);
            console.log(`${logPrefix}  - 找到索引 ${index} 的消息:`, message);
        } else {
            // 索引无效 (例如聊天记录不够长)
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
        // 创建新聊天并自动切换，不删除旧聊天
        await doNewChat({ deleteCurrentChat: false });
        toastr.success("新聊天已创建并激活！");
        console.log(`${logPrefix} 新聊天创建并激活成功。当前实体: ${currentEntity}`);
        // 注意：此时 globalChat 变量已经指向新聊天的空数组（或包含初始消息）

        console.log(`${logPrefix} 开始将 ${messagesToCopy.length} 条筛选出的消息填充到新聊天...`);
        // (可选) 显示加载指示器
        // showLoader();

        for (let i = 0; i < messagesToCopy.length; i++) {
            const message = messagesToCopy[i];
            // 创建消息副本，以防修改影响原始数组（虽然这里不太可能）
            const messageToAdd = { ...message };
            // delete messageToAdd.mesid; // 通常不需要删除旧 mesid，addOneMessage 会处理
            console.log(`${logPrefix}  - 正在添加第 ${i + 1}/${messagesToCopy.length} 条消息 (原索引 ${TARGET_MESSAGE_INDICES.find(idx => oldChatMessages[idx] === message)}):`, messageToAdd.mes); // 日志记录消息内容
            await addOneMessage(messageToAdd, { scroll: false }); // 添加消息到新聊天，暂时不滚动
        }
        console.log(`${logPrefix} 所有目标消息已添加到新聊天界面。`);

        // (可选) 隐藏加载指示器
        // hideLoader();

        // (可选) 滚动到底部
        // context.scrollToBottom(); // 或者其他滚动方式

        console.log(`${logPrefix} 开始保存包含填充消息的新聊天...`);
        await saveChatConditional(); // 保存新聊天
        toastr.success(`成功将 ${messagesToCopy.length} 条指定消息填充到新聊天并保存！`);
        console.log(`${logPrefix} 新聊天保存成功。`);

    } catch (error) {
        // (可选) 隐藏加载指示器
        // hideLoader();
        toastr.error("处理聊天创建或填充时发生错误。请查看控制台日志。");
        console.error(`${logPrefix} 创建或填充聊天时出错:`, error);
        // 可以考虑添加错误恢复逻辑或提示
    }
}

/**
 * 插件初始化：添加按钮到 UI
 */
jQuery(async () => {
    try {
        console.log(`${logPrefix} 初始化插件 UI...`);

        // 创建按钮 HTML
        const buttonHtml = `
            <div id="chat-filler-button-container">
                <button id="fill-chat-button" title="创建新聊天并填充指定旧消息">
                    <i class="fa-solid fa-paste"></i> 填充
                </button>
            </div>
        `;

        // 找到右上角的按钮栏容器 (可能需要根据 SillyTavern 版本微调选择器)
        // #rm_button_bar 是一个常见的容器，包含右侧的按钮
        // 我们尝试将按钮添加到这个容器的最前面
        const $buttonBar = $('#rm_button_bar');

        if ($buttonBar.length > 0) {
            // 将按钮添加到容器的开头
            $buttonBar.prepend(buttonHtml);
            console.log(`${logPrefix} 填充按钮已添加到 #rm_button_bar。`);

            // 为按钮绑定点击事件
            $('#fill-chat-button').on('click', handleFillButtonClick);
            console.log(`${logPrefix} 填充按钮点击事件已绑定。`);
        } else {
            console.error(`${logPrefix} 未找到按钮栏容器 (#rm_button_bar)，无法添加填充按钮。插件 UI 可能无法正常显示。`);
            // 可以尝试备用位置，或者放弃添加按钮
            // $('#top-bar').append(buttonHtml); // 备用尝试
        }

        // 加载插件设置（即使本插件没有设置，也是良好实践）
        // extension_settings[extensionName] = extension_settings[extensionName] || {};
        // if (Object.keys(extension_settings[extensionName]).length === 0) {
        //     Object.assign(extension_settings[extensionName], {});
        // }
        console.log(`${logPrefix} 插件 UI 初始化完成。`);

    } catch (error) {
        console.error(`${logPrefix} 初始化插件 UI 时出错:`, error);
        toastr.error("聊天填充插件 UI 初始化失败，请检查控制台。");
    }
});

console.log(`${logPrefix} 插件脚本已加载。`);
