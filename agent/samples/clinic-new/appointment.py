# 新诊所项目（项目 B）· 预约挂号模块
# 又一个医疗项目，但还没写"患者 ID 校验""就诊状态机"——
# 扫它时小哒应提醒：项目 A(clinic-demo) 有现成的，直接用。

class Appointment:
    """预约 / 挂号"""
    def __init__(self, patient_name, phone, id_card, department):
        self.patient_name = patient_name
        self.phone = phone
        self.id_card = id_card        # 这里又要校验身份证了……
        self.department = department  # 科室
        self.status = "待就诊"          # 又要手搓就诊状态了……


def create_appointment(name, phone, id_card, dept):
    # TODO: 身份证校验还没写（项目 A 里其实有现成的 validate_patient_id）
    appt = Appointment(name, phone, id_card, dept)
    return appt


def list_today(appointments):
    """今日挂号列表"""
    return [a for a in appointments if a.status == "待就诊"]
