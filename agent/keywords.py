"""行业关键词库 —— 扫盘反推画像用。

口径对齐 Agent接口契约.html 里的「医疗关键词库」。
今晚先做厚医疗（金样本行业）；其余行业留少量种子词，二期再扩。

命中权重原则（见接口契约）：类别覆盖广度 > 单词高频。
即命中 3 个不同类别，比单个词出现 50 次更能说明行业。
"""

# 每个行业 -> { 类别: [中文词..., 英文/变量名特征...] }
INDUSTRY_KEYWORDS = {
    "医疗": {
        "患者/对象": ["患者", "就诊人", "病人", "家属", "patient", "visitor", "caseId", "mrn"],
        "就诊流程": ["挂号", "候诊", "就诊", "复诊", "出诊", "转诊", "register", "queue",
                  "visit", "followup", "referral", "appointment"],
        "临床": ["主诉", "诊断", "医嘱", "处方", "用药", "禁忌症", "病历", "diagnosis",
               "prescription", "medication", "contraindication", "symptom"],
        "组织": ["科室", "门诊", "住院", "床位", "排班", "department", "outpatient",
               "inpatient", "ward", "schedule"],
        "合规/红线": ["隐私", "脱敏", "知情同意", "medicalRecord", "privacy",
                  "desensitize", "consent"],
    },
    # —— 以下为二期种子词，今晚 demo 主打医疗 ——
    "金融": {
        "账户": ["账户", "余额", "account", "balance", "ledger"],
        "交易": ["交易", "转账", "支付", "transaction", "transfer", "payment", "settle"],
        "风控": ["风控", "反洗钱", "额度", "风险", "risk", "aml", "kyc", "fraud"],
        "合规": ["合规", "审计", "对账", "compliance", "audit", "reconcile"],
    },
    "工业/制造": {
        "设备": ["设备", "机台", "产线", "device", "machine", "line", "plc"],
        "工艺": ["工艺", "参数", "良率", "process", "param", "yield", "recipe"],
        "告警": ["告警", "阈值", "停机", "alarm", "threshold", "downtime", "fault"],
    },
    "电商/零售": {
        "商品": ["商品", "库存", "sku", "product", "inventory", "stock"],
        "订单": ["订单", "下单", "退款", "order", "checkout", "refund", "cart"],
        "营销": ["优惠券", "促销", "活动", "coupon", "promotion", "campaign"],
    },
    "教育": {
        "学员": ["学员", "学生", "student", "learner", "enrollment"],
        "课程": ["课程", "课时", "排课", "course", "lesson", "curriculum"],
        "测评": ["作业", "考试", "成绩", "homework", "exam", "score", "quiz"],
    },
}

# 行业 -> 红线清单（/profile 出参的 redlines；/review 据此判红线等级）
INDUSTRY_REDLINES = {
    "医疗": [
        "患者隐私字段不得明文存储",
        "就诊/挂号时段需防并发重复",
        "用药需校验禁忌症",
        "病历流转关键步骤不得缺失复核",
    ],
    "金融": [
        "金额计算不得用浮点数（须用定点/整数分）",
        "交易需幂等、防重复扣款",
        "敏感账户信息不得明文存储或日志打印",
    ],
    "工业/制造": [
        "设备状态写入需加锁防并发",
        "工艺参数越界须告警而非静默",
    ],
    "电商/零售": [
        "库存扣减需防超卖",
        "支付与订单状态须一致、可对账",
    ],
    "教育": [
        "未成年人个人信息需脱敏",
        "成绩/测评数据不得越权访问",
    ],
}

# 行业 -> 子领域猜测（仅医疗给细，其余给泛）
INDUSTRY_SUBDOMAIN = {
    "医疗": "社区诊所 / 门诊管理",
    "金融": "支付 / 账务",
    "工业/制造": "设备 / 工艺监控",
    "电商/零售": "交易 / 库存",
    "教育": "教务 / 测评",
}


def all_terms_flat(industry: str):
    """把某行业所有类别的词拍平成一个列表，供扫盘匹配。返回 (词, 类别) 列表。"""
    out = []
    for category, terms in INDUSTRY_KEYWORDS.get(industry, {}).items():
        for t in terms:
            out.append((t, category))
    return out
