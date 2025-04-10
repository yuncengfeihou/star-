import {
    // 从 extensions.js 导入 getContext (以及其他可能需要的)
    getContext,
    // extension_settings, // 如果你需要存储设置
    // renderExtensionTemplateAsync // 如果你使用 HTML 模板
} from '../../../extensions.js';

import {
    // 从 script.js 导入核心功能
    doNewChat,
    addOneMessage,
    saveChatConditional,
    chat as globalChat, // 当前活动聊天数组的引用
    this_chid,
    is_send_press,
    isChatSaving,
} from '../../../../script.js';

import {
    // 从 group-chats.js 导入群组相关
    selected_group,
    is_group_generating
} from '../../../group-chats.js';

// (推荐) 导入 toastr 用于用户提示
import { toastr } from '../../../../lib/toastr.js';

// 定义插件名称，应与文件夹名称一致
const extensionName = "star0";
const extensionFolderPath = `scripts/extensions/third-party/${extensionName}`;

// (标准模板) 插件设置处理，即使此插件不用设置也建议保留结构
// const extensionSettings = extension_settings[extensionName];
// const defaultSettings = {}; // 此插件没有设置，保留空对象

// async function loadSettings() {
//     extension_settings[extensionName] = extension_settings[extensionName] || {};
//     if (Object.keys(extension_settings[extensionName]).length === 0) {
//         Object.assign(extension_settings[extensionName], defaultSettings);
//     }
//     // 如果有设置，在这里更新 UI
//     console.log(`[${extensionName}] Settings loaded.`);
// }

// --- 核心功能函数：创建新聊天并填充特定消息 ---
async function createAndFillChat() {
    console.log(`[${extensionName}] [填充] 按钮被点击。`);
    const context = getContext(); // 获取当前上下文

    // 1. 检查状态和当前选择
    const currentCharacterId = this_chid;
    const currentGroupId = selected_group;
    const entityType = currentGroupId ? '群组' : (currentCharacterId !== undefined ? '角色' : null);
    const entityId = currentGroupId ?? currentCharacterId;

    if (!entityType) {
        toastr.warning("请先选择一个角色或群组。");
        console.warn(`[${extensionName}] 没有选择任何角色或群组，操作中止。`);
        return;
    }
    console.log(`[${extensionName}] 当前活动的实体: ${entityType} ${entityId}`);

    if (is_send_press || is_group_generating) {
        toastr.warning("正在生成回复，请稍后再试。");
        console.warn(`[${extensionName}] 正在生成回复 (is_send_press: ${is_send_press}, is_group_generating: ${is_group_generating})，操作中止。`);
        return;
    }
    if (isChatSaving) {
        toastr.warning("聊天正在保存，请稍后再试。");
        console.warn(`[${extensionName}] 聊天正在保存 (isChatSaving: ${isChatSaving})，操作中止。`);
        return;
    }

    // 2. 保存旧聊天信息的副本
    // !! 这是最关键的一步：在创建新聊天之前复制旧聊天数组 !!
    const oldChatMessages = [...globalChat]; // 使用展开运算符创建浅拷贝
    const oldChatId = context.getCurrentChatId ? context.getCurrentChatId() : '无法获取旧ID'; // 尝试获取旧聊天ID用于日志
    console.log(`[${extensionName}] 已获取旧聊天内容的副本。旧聊天 ID: ${oldChatId}, 消息数量: ${oldChatMessages.length}`);

    if (oldChatMessages.length === 0) {
        toastr.info("当前聊天是空的，无法获取指定消息。将只创建新聊天。");
        console.log(`[${extensionName}] 旧聊天为空，跳过填充步骤。`);
    }

    // 3. 识别旧聊天中要填充的消息 (根据原始 mesid/索引 1, 3, 7)
    const targetIndices = [1, 3, 7]; // 要从旧聊天复制的消息的索引
    const messagesToFill = [];

    if (oldChatMessages.length > 0) {
        console.log(`[${extensionName}] 开始从旧聊天副本中查找索引为 ${targetIndices.join(', ')} 的消息...`);
        targetIndices.forEach(index => {
            if (index >= 0 && index < oldChatMessages.length) {
                // 确保索引有效
                const message = oldChatMessages[index];
                messagesToFill.push(message); // 将找到的消息对象添加到待填充列表
                // 日志输出消息的部分内容以便确认
                const messagePreview = message && message.mes ? `"${message.mes.substring(0, 30)}..."` : '(消息内容为空或无效)';
                console.log(`[${extensionName}] -> 找到索引 ${index} 的消息: [${message?.name}(${message?.is_user ? 'User' : 'Char'})] ${messagePreview}`);
            } else {
                console.warn(`[${extensionName}] -> 警告：尝试获取的索引 ${index} 超出旧聊天副本范围 (0-${oldChatMessages.length - 1})，已跳过。`);
            }
        });
        console.log(`[${extensionName}] 共找到 ${messagesToFill.length} 条符合索引的消息准备填充。`);

        // (可选) 识别旧聊天中 mesid 为 0, 2, 3 的消息（仅作日志演示，不实际使用）
        const targetIndicesForLog = [0, 2, 3];
        console.log(`[${extensionName}] (仅日志) 检查旧聊天副本中索引为 ${targetIndicesForLog.join(', ')} 的消息:`);
        targetIndicesForLog.forEach(index => {
             if (index >= 0 && index < oldChatMessages.length) {
                 const msg = oldChatMessages[index];
                 console.log(`[${extensionName}] (仅日志) -> 索引 ${index}: [${msg?.name}] ${msg?.mes?.substring(0,30)}...`);
             } else {
                 console.log(`[${extensionName}] (仅日志) -> 索引 ${index} 不存在。`);
             }
        });
    }


    try {
        // 4. 创建新聊天 (会自动切换)
        console.log(`[${extensionName}] 准备调用 doNewChat() 为 ${entityType} ${entityId} 创建新聊天...`);
        await doNewChat({ deleteCurrentChat: false }); // 创建新聊天，不删除旧的
        // --- 从这里开始，内部状态 (包括 globalChat) 已指向新聊天 ---
        const newChatId = context.getCurrentChatId ? context.getCurrentChatId() : '无法获取新ID';
        console.log(`[${extensionName}] 新聊天已创建并激活。新聊天 ID: ${newChatId}。当前 globalChat 长度: ${globalChat.length}`);
        toastr.success("新聊天已创建！");

        // 5. 填充消息到新聊天
        if (messagesToFill.length > 0) {
            console.log(`[${extensionName}] 开始将 ${messagesToFill.length} 条选定消息填充到新聊天中...`);
            // 迭代找到的消息，并使用 addOneMessage 添加到当前（新的）聊天
            for (const message of messagesToFill) {
                // 创建消息对象的副本，以防修改原始副本中的对象
                const messageToAdd = { ...message };
                // 通常不需要手动处理 mesid，addOneMessage 会处理
                // delete messageToAdd.mesid; // 可以尝试移除，但通常不需要

                console.log(`[${extensionName}] --> 正在添加消息: [${messageToAdd.name}] ${messageToAdd.mes.substring(0, 50)}...`);
                // 添加消息到新聊天，暂时禁止滚动
                await addOneMessage(messageToAdd, { scroll: false });
            }
            console.log(`[${extensionName}] 所有选定消息已添加到新聊天界面。`);

            // 6. 保存新聊天
            console.log(`[${extensionName}] 准备保存包含填充消息的新聊天...`);
            await saveChatConditional(); // 使用条件保存，更安全
            console.log(`[${extensionName}] 新聊天已成功保存。`);
            toastr.success(`已将 ${messagesToFill.length} 条指定消息填充到新聊天并保存。`);

        } else {
            console.log(`[${extensionName}] 没有找到可填充的消息（或原聊天为空），仅创建了空的新聊天。`);
            // 如果没有消息填充，新聊天通常是自动保存的（或在下次操作时保存），可以不调用 saveChatConditional
        }

        // (可选) 操作完成后可以滚动到底部
        // context.scrollToBottom(); // 如果 context 有提供

    } catch (error) {
        toastr.error("创建或填充新聊天时发生错误，请查看控制台日志。");
        console.error(`[${extensionName}] 创建或填充新聊天时捕获到错误:`, error);
        // 可以在这里添加错误恢复逻辑，虽然通常很难回滚 doNewChat
    } finally {
         console.log(`[${extensionName}] [填充] 操作执行完毕。`);
    }
}

// --- 插件 UI 初始化 ---
jQuery(async () => {
    // 创建插件在设置页面的 HTML 结构
    const settingsHtml = `
        <div id="star0_settings_block" class="star0-settings">
            <div class="inline-drawer">
                <div class="inline-drawer-toggle inline-drawer-header">
                    <b>Star0 聊天填充测试</b>
                    <div class="inline-drawer-icon fa-solid fa-circle-chevron-down down"></div>
                </div>
                <div class="inline-drawer-content">
                    <p>点击下面的按钮，将执行以下操作：</p>
                    <ol>
                        <li>获取当前聊天中索引为 1, 3, 7 的消息。</li>
                        <li>为当前角色/群组创建一个新的聊天会话。</li>
                        <li>切换到这个新创建的聊天。</li>
                        <li>将第1步获取到的消息填充到新聊天中。</li>
                        <li>保存新聊天。</li>
                    </ol>
                    <input id="star0_fill_button" class="menu_button" type="button" value="[填充]" />
                    <hr class="sysHR">
                </div>
            </div>
        </div>
    `;

    // 将 HTML 添加到扩展设置区域
    $("#extensions_settings").append(settingsHtml);

    // 为按钮绑定点击事件
    $("#star0_fill_button").on("click", createAndFillChat);

    // (标准模板) 加载设置，如果你的插件有设置的话
    // loadSettings();

    console.log(`[${extensionName}] 插件 UI 初始化完成。`);
});
