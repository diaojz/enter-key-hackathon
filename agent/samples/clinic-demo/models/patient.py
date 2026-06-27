# 患者数据模型 · 门诊系统
# 医疗领域词密集，给扫盘反推画像用。

class Patient:
    """患者 / 就诊人"""
    def __init__(self, mrn, name, phone, id_card):
        self.mrn = mrn            # 病案号
        self.name = name
        self.phone = phone
        self.id_card = id_card    # 身份证
        self.diagnosis = None     # 诊断
        self.prescription = []    # 处方
        self.department = None     # 科室


def validate_patient_id(id_card: str) -> bool:
    """患者 ID 校验（这就是能跨项目复用的轮子之一）"""
    if not id_card or len(id_card) != 18:
        return False
    return id_card[:17].isdigit()


# 就诊状态机（另一个可复用轮子）
VISIT_STATES = ["待就诊", "就诊中", "已完成", "复诊"]
