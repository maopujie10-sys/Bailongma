// 视觉和事件感知类 schema：screen_capture / visual_perceive / event_perceive / get_active_window / get_clipboard
export const perceptionSchemas = {
  screen_capture: {
    type: 'function',
    function: {
      name: 'screen_capture',
      description: '截取当前屏幕截图，返回图片尺寸信息。适合需要了解用户当前屏幕状态时调用。',
      parameters: {
        type: 'object',
        properties: {},
        required: []
      }
    }
  },

  visual_perceive: {
    type: 'function',
    function: {
      name: 'visual_perceive',
      description: '对当前屏幕进行完整视觉感知：截图 + OCR文字识别 + AI图像描述。返回屏幕上的文字内容和图像描述。适合需要理解用户屏幕上显示的内容时调用。',
      parameters: {
        type: 'object',
        properties: {
          question: {
            type: 'string',
            description: '可选：针对屏幕内容的具体问题，如"屏幕上有什么错误信息？"'
          }
        },
        required: []
      }
    }
  },

  event_perceive: {
    type: 'function',
    function: {
      name: 'event_perceive',
      description: '一次性获取所有事件感知数据：当前活动窗口信息 + 剪贴板内容 + 最近文件变化事件。适合需要全面了解用户当前操作上下文时调用。',
      parameters: {
        type: 'object',
        properties: {},
        required: []
      }
    }
  },

  get_active_window: {
    type: 'function',
    function: {
      name: 'get_active_window',
      description: '获取当前活动窗口的标题和位置信息。适合需要知道用户正在使用哪个应用时调用。',
      parameters: {
        type: 'object',
        properties: {},
        required: []
      }
    }
  },

  get_clipboard: {
    type: 'function',
    function: {
      name: 'get_clipboard',
      description: '读取当前剪贴板中的文本内容。适合用户提到"复制了"或需要获取剪贴板内容时调用。',
      parameters: {
        type: 'object',
        properties: {},
        required: []
      }
    }
  }
}
